import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import https from "node:https";

const agent = new https.Agent({ rejectUnauthorized: false });

async function fetchInsecure(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { agent, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

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

// Fetch top finance/business headlines (not tied to any specific symbol)
export async function fetchGeneralNews(maxResults = 10): Promise<{ title: string; link: string; source: string; pubDate: string }[]> {
  const feeds = [
    "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en", // Google News Business
    "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", // Google News Top Stories
  ];
  const allArticles: { title: string; link: string; source: string; pubDate: string }[] = [];

  for (const url of feeds) {
    try {
      const xml = await fetchInsecure(url);
      allArticles.push(...parseRSSItems(xml, "MARKET"));
    } catch { /* skip */ }
  }

  // Deduplicate by title
  const seen = new Set<string>();
  return allArticles.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; }).slice(0, maxResults);
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
    const xml = await fetchInsecure(url);
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

    const xml = await fetchInsecure(url);
    const articles = parseRSSItems(xml, symbol).slice(0, max);

    return { symbol, articles };
  },
});
