import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const SYMBOL_NAMES: Record<string, string> = {
  AAPL: "Apple AAPL",
  TSLA: "Tesla TSLA",
  SAP: "SAP SE",
  MSFT: "Microsoft MSFT",
  GOOGL: "Google GOOGL",
  AMZN: "Amazon AMZN",
  META: "Meta META",
  NVDA: "Nvidia NVDA",
  "BRK-B": "Berkshire Hathaway BRK",
  AVGO: "Broadcom AVGO",
  LLY: "Eli Lilly LLY",
  JPM: "JPMorgan Chase JPM",
  UNH: "UnitedHealth UNH",
  GS: "Goldman Sachs GS",
  HD: "Home Depot HD",
  AMGN: "Amgen AMGN",
  CAT: "Caterpillar CAT",
  MCD: "McDonald's MCD",
  V: "Visa stock V",
  CRM: "Salesforce CRM",
  COST: "Costco COST",
  NFLX: "Netflix NFLX",
  "^GSPC": "S&P 500",
  "^DJI": "Dow Jones",
  "^IXIC": "NASDAQ",
};

function parseRSSItems(
  xml: string,
  symbol: string
): { title: string; link: string; source: string; pubDate: string }[] {
  const items: { title: string; link: string; source: string; pubDate: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";

    const parts = title.split(" - ");
    const source = parts.length > 1 ? parts[parts.length - 1] : "Google News";
    const headline = parts.length > 1 ? parts.slice(0, -1).join(" - ") : title;

    const decoded = headline
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    items.push({ title: decoded, link, source, pubDate });
  }

  return items;
}

// Standalone fetch function for use outside the agent tool
export async function fetchNewsForSymbol(
  symbol: string,
  maxResults = 5
): Promise<{ symbol: string; articles: { title: string; link: string; source: string; pubDate: string }[] }> {
  const searchTerm = SYMBOL_NAMES[symbol] ?? `${symbol} stock`;
  const query = encodeURIComponent(searchTerm);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "stock-monitor/1.0" },
    });
    if (!res.ok) return { symbol, articles: [] };
    const xml = await res.text();
    return { symbol, articles: parseRSSItems(xml, symbol).slice(0, maxResults) };
  } catch {
    return { symbol, articles: [] };
  }
}

export const fetchNews = createTool({
  id: "fetch-news",
  description:
    "Fetches recent news headlines for a stock symbol from Google News RSS. Returns raw headlines for analysis.",
  inputSchema: z.object({
    symbol: z.string().describe("The stock ticker symbol"),
    maxResults: z.number().optional().describe("Maximum headlines to return (default 8)"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    articles: z.array(
      z.object({
        title: z.string(),
        link: z.string(),
        source: z.string(),
        pubDate: z.string(),
      })
    ),
  }),
  execute: async ({ symbol, maxResults }) => {
    const max = maxResults ?? 8;
    const searchTerm = SYMBOL_NAMES[symbol] ?? `${symbol} stock`;
    const query = encodeURIComponent(searchTerm);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

    const res = await fetch(url, {
      headers: { "User-Agent": "stock-monitor/1.0" },
    });

    if (!res.ok) {
      throw new Error(`Google News returned ${res.status} for ${symbol}`);
    }

    const xml = await res.text();
    const articles = parseRSSItems(xml, symbol).slice(0, max);

    return { symbol, articles };
  },
});
