import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getStockPrice = createTool({
  id: "get-stock-price",
  description:
    "Fetches the current stock price for a given ticker symbol using Yahoo Finance (free, no API key needed)",
  inputSchema: z.object({
    symbol: z
      .string()
      .describe("The stock ticker symbol (e.g. AAPL, SAP, TSLA)"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    price: z.number(),
    open: z.number(),
    previousClose: z.number(),
    timestamp: z.string(),
  }),
  execute: async ({ symbol }) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "stock-monitor/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Yahoo Finance returned ${response.status} for ${symbol}`
      );
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta?.regularMarketPrice) {
      throw new Error(
        `Could not fetch price for ${symbol}. Response: ${JSON.stringify(data)}`
      );
    }

    // Open price is the first candle's open from intraday data
    const firstCandleOpen = result?.indicators?.quote?.[0]?.open?.[0] as
      | number
      | undefined;

    return {
      symbol: meta.symbol as string,
      price: meta.regularMarketPrice as number,
      open: firstCandleOpen ?? meta.regularMarketPrice as number,
      previousClose: (meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice) as number,
      timestamp: new Date(
        (meta.regularMarketTime as number) * 1000
      ).toISOString(),
    };
  },
});
