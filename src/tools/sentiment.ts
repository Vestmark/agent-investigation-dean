import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const fetchRedditSentiment = createTool({
  id: "fetch-reddit-sentiment",
  description: "Fetch recent Reddit posts mentioning a stock symbol from investing/stocks subreddits. Returns raw posts for sentiment analysis.",
  inputSchema: z.object({
    symbol: z.string().describe("Stock ticker symbol to search for"),
    subreddit: z.string().optional().describe("Subreddit to search (default: wallstreetbets+stocks+investing)"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    posts: z.array(z.object({
      title: z.string(),
      subreddit: z.string(),
      score: z.number(),
      comments: z.number(),
      created: z.string(),
      url: z.string(),
      selftext: z.string(),
    })),
    error: z.string().optional(),
  }),
  execute: async ({ symbol, subreddit }) => {
    const sub = subreddit ?? "wallstreetbets+stocks+investing";
    const sym = symbol.toUpperCase().replace("^", "");
    try {
      const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(sym)}&sort=new&restrict_sr=on&limit=15&t=week`;
      const res = await fetch(url, {
        headers: { "User-Agent": "stock-monitor/1.0 (research bot)" },
      });
      if (!res.ok) throw new Error(`Reddit returned ${res.status}`);
      const data = await res.json() as any;

      const posts = (data.data?.children ?? []).map((c: any) => {
        const d = c.data;
        return {
          title: d.title ?? "",
          subreddit: d.subreddit ?? "",
          score: d.score ?? 0,
          comments: d.num_comments ?? 0,
          created: new Date((d.created_utc ?? 0) * 1000).toISOString().split("T")[0],
          url: `https://reddit.com${d.permalink ?? ""}`,
          selftext: (d.selftext ?? "").slice(0, 300),
        };
      });

      return { symbol: sym, posts };
    } catch (err) {
      return {
        symbol: sym,
        posts: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export const fetchStockTwitsSentiment = createTool({
  id: "fetch-stocktwits-sentiment",
  description: "Fetch recent StockTwits messages for a stock symbol to gauge social sentiment.",
  inputSchema: z.object({
    symbol: z.string().describe("Stock ticker symbol"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    messages: z.array(z.object({
      body: z.string(),
      created: z.string(),
      sentiment: z.string(),
      username: z.string(),
    })),
    bullish: z.number(),
    bearish: z.number(),
    error: z.string().optional(),
  }),
  execute: async ({ symbol }) => {
    const sym = symbol.toUpperCase().replace("^", "");
    try {
      const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(sym)}.json`;
      const res = await fetch(url, {
        headers: { "User-Agent": "stock-monitor/1.0" },
      });
      if (!res.ok) throw new Error(`StockTwits returned ${res.status}`);
      const data = await res.json() as any;

      let bullish = 0;
      let bearish = 0;
      const messages = (data.messages ?? []).slice(0, 15).map((m: any) => {
        const sent = m.entities?.sentiment?.basic ?? "neutral";
        if (sent === "Bullish") bullish++;
        if (sent === "Bearish") bearish++;
        return {
          body: (m.body ?? "").slice(0, 200),
          created: m.created_at ?? "",
          sentiment: sent,
          username: m.user?.username ?? "",
        };
      });

      return { symbol: sym, messages, bullish, bearish };
    } catch (err) {
      return {
        symbol: sym,
        messages: [],
        bullish: 0,
        bearish: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
