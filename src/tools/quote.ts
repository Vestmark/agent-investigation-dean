import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import https from "node:https";

const agent = new https.Agent({ rejectUnauthorized: false });

function fetchJSON(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https.get(url, { agent, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
      res.on("error", reject);
    }).on("error", reject);
  });
}

export const getQuote = createTool({
  id: "get-quote",
  description:
    "Fetches a live stock quote for ANY ticker symbol (not limited to portfolio holdings). Returns opening price, current price, and day gain/loss. Use this when the user asks about a symbol that may not be in the portfolio.",
  inputSchema: z.object({
    symbol: z.string().describe("Stock ticker symbol (e.g. AAPL, TSLA, PLTR)"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    open: z.number(),
    current: z.number(),
    change: z.number(),
    changePct: z.number(),
    previousClose: z.number(),
    timestamp: z.string(),
  }),
  execute: async ({ symbol }) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=1m&range=1d`;
    const data = await fetchJSON(url) as Record<string, unknown>;
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta?.regularMarketPrice) {
      throw new Error(`Could not fetch quote for ${symbol}`);
    }

    const current = meta.regularMarketPrice as number;
    const firstCandleOpen = result?.indicators?.quote?.[0]?.open?.[0] as number | undefined;
    const open = firstCandleOpen ?? current;
    const previousClose = (meta.previousClose ?? meta.chartPreviousClose ?? current) as number;
    const change = current - open;
    const changePct = open !== 0 ? (change / open) * 100 : 0;

    return {
      symbol: (meta.symbol as string) || symbol.toUpperCase(),
      open,
      current,
      change,
      changePct,
      previousClose,
      timestamp: new Date((meta.regularMarketTime as number) * 1000).toISOString(),
    };
  },
});
