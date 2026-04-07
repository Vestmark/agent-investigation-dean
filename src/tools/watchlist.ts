import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { loadSymbols, addSymbol, removeSymbol } from "../symbols.js";

export const listWatchlist = createTool({
  id: "list-watchlist",
  description: "List all symbols currently on the monitoring watchlist.",
  inputSchema: z.object({}),
  outputSchema: z.object({ symbols: z.array(z.string()) }),
  execute: async () => ({ symbols: await loadSymbols() }),
});

export const addToWatchlist = createTool({
  id: "add-to-watchlist",
  description: "Add a stock symbol to the monitoring watchlist so it gets tracked for prices and news.",
  inputSchema: z.object({
    symbol: z.string().describe("Stock ticker symbol to add (e.g. PLTR, AMD)"),
  }),
  outputSchema: z.object({ symbols: z.array(z.string()), added: z.string() }),
  execute: async ({ symbol }) => {
    const upper = symbol.toUpperCase();
    const symbols = await addSymbol(upper);
    return { symbols, added: upper };
  },
});

export const removeFromWatchlist = createTool({
  id: "remove-from-watchlist",
  description: "Remove a stock symbol from the monitoring watchlist. This stops price and news tracking for that symbol.",
  inputSchema: z.object({
    symbol: z.string().describe("Stock ticker symbol to remove (e.g. PLTR, AMD)"),
  }),
  outputSchema: z.object({ symbols: z.array(z.string()), removed: z.string() }),
  execute: async ({ symbol }) => {
    const upper = symbol.toUpperCase();
    const symbols = await removeSymbol(upper);
    return { symbols, removed: upper };
  },
});
