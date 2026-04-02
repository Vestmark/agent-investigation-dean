import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getAllHoldings, getHouseholds, getPeople } from "../db.js";

// Shared price map — set by index.ts when prices update
let priceMap: Record<string, number> = {};

export function updatePriceMap(map: Record<string, number>): void {
  priceMap = { ...map };
}

export const queryPortfolio = createTool({
  id: "query-portfolio",
  description: "Query portfolio holdings, positions, P/L, and current prices. Use this when the user asks about stocks, holdings, households, people, or portfolio performance.",
  inputSchema: z.object({
    filter: z.string().optional().describe("Optional filter: a symbol like 'AAPL', a person name, or a household name. Leave empty for full portfolio."),
  }),
  outputSchema: z.object({
    holdings: z.array(z.object({
      symbol: z.string(),
      stock_name: z.string(),
      person_name: z.string(),
      household: z.string(),
      positions: z.number(),
      strike_price: z.number(),
      current_price: z.number(),
      current_value: z.number(),
      strike_value: z.number(),
      pl: z.number(),
    })),
    summary: z.string(),
  }),
  execute: async ({ filter }) => {
    let holdings = getAllHoldings();
    const f = filter?.trim();

    if (f) {
      const upper = f.toUpperCase();
      const lower = f.toLowerCase();
      holdings = holdings.filter(h =>
        h.symbol.toUpperCase() === upper ||
        h.person_name.toLowerCase().includes(lower) ||
        h.household.toLowerCase().includes(lower)
      );
    }

    const enriched = holdings.map(h => {
      const cp = priceMap[h.symbol] || 0;
      const cv = h.positions * cp;
      const sv = h.positions * h.strike_price;
      return {
        symbol: h.symbol,
        stock_name: h.stock_name,
        person_name: h.person_name,
        household: h.household,
        positions: h.positions,
        strike_price: h.strike_price,
        current_price: cp,
        current_value: cv,
        strike_value: sv,
        pl: cv - sv,
      };
    });

    const totalCV = enriched.reduce((s, h) => s + h.current_value, 0);
    const totalSV = enriched.reduce((s, h) => s + h.strike_value, 0);
    const totalPL = totalCV - totalSV;

    return {
      holdings: enriched,
      summary: `${enriched.length} holdings | Current Value: $${totalCV.toFixed(2)} | Strike Value: $${totalSV.toFixed(2)} | P/L: ${totalPL >= 0 ? '+' : ''}$${totalPL.toFixed(2)}`,
    };
  },
});

export const queryPrices = createTool({
  id: "query-prices",
  description: "Get current market prices for tracked symbols.",
  inputSchema: z.object({
    symbols: z.array(z.string()).optional().describe("Specific symbols to query. Leave empty for all tracked prices."),
  }),
  outputSchema: z.object({
    prices: z.array(z.object({ symbol: z.string(), price: z.number() })),
  }),
  execute: async ({ symbols }) => {
    const entries = symbols && symbols.length > 0
      ? symbols.map(s => ({ symbol: s, price: priceMap[s.toUpperCase()] || 0 }))
      : Object.entries(priceMap).map(([symbol, price]) => ({ symbol, price }));
    return { prices: entries.sort((a, b) => a.symbol.localeCompare(b.symbol)) };
  },
});
