import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const fetchCompanyProfile = createTool({
  id: "fetch-company-profile",
  description: "Fetch company profile, sector, industry, and key stats from Yahoo Finance for a given stock symbol.",
  inputSchema: z.object({
    symbol: z.string().describe("Stock ticker symbol"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    name: z.string(),
    sector: z.string(),
    industry: z.string(),
    marketCap: z.string(),
    peRatio: z.number(),
    forwardPE: z.number(),
    dividendYield: z.string(),
    fiftyTwoWeekHigh: z.number(),
    fiftyTwoWeekLow: z.number(),
    avgVolume: z.number(),
    description: z.string(),
    error: z.string().optional(),
  }),
  execute: async ({ symbol }) => {
    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,defaultKeyStatistics,summaryDetail,price`;
      const res = await fetch(url, {
        headers: { "User-Agent": "stock-monitor/1.0" },
      });
      if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
      const data = await res.json() as Record<string, unknown>;
      const result = (data as any).quoteSummary?.result?.[0] ?? {};
      const profile = result.assetProfile ?? {};
      const stats = result.defaultKeyStatistics ?? {};
      const summary = result.summaryDetail ?? {};
      const price = result.price ?? {};

      return {
        symbol: symbol.toUpperCase(),
        name: price.shortName ?? price.longName ?? symbol,
        sector: profile.sector ?? "N/A",
        industry: profile.industry ?? "N/A",
        marketCap: price.marketCap?.fmt ?? "N/A",
        peRatio: summary.trailingPE?.raw ?? 0,
        forwardPE: stats.forwardPE?.raw ?? summary.forwardPE?.raw ?? 0,
        dividendYield: summary.dividendYield?.fmt ?? "N/A",
        fiftyTwoWeekHigh: summary.fiftyTwoWeekHigh?.raw ?? 0,
        fiftyTwoWeekLow: summary.fiftyTwoWeekLow?.raw ?? 0,
        avgVolume: summary.averageVolume?.raw ?? 0,
        description: (profile.longBusinessSummary ?? "").slice(0, 500),
      };
    } catch (err) {
      return {
        symbol: symbol.toUpperCase(),
        name: symbol, sector: "N/A", industry: "N/A", marketCap: "N/A",
        peRatio: 0, forwardPE: 0, dividendYield: "N/A",
        fiftyTwoWeekHigh: 0, fiftyTwoWeekLow: 0, avgVolume: 0,
        description: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export const fetchSECFilings = createTool({
  id: "fetch-sec-filings",
  description: "Fetch recent SEC filings (10-K, 10-Q, 8-K) from EDGAR for a given company ticker.",
  inputSchema: z.object({
    symbol: z.string().describe("Stock ticker symbol"),
    count: z.number().optional().describe("Number of filings to return (default 5)"),
  }),
  outputSchema: z.object({
    filings: z.array(z.object({
      form: z.string(),
      date: z.string(),
      description: z.string(),
      url: z.string(),
    })),
    error: z.string().optional(),
  }),
  execute: async ({ symbol, count }) => {
    const limit = count ?? 5;
    try {
      // First, look up CIK from ticker
      const tickerRes = await fetch(
        `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&dateRange=custom&startdt=2024-01-01&forms=10-K,10-Q,8-K`,
        { headers: { "User-Agent": "stock-monitor admin@example.com" } }
      );

      // Use full-text search API instead
      const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22&forms=10-K,10-Q,8-K&dateRange=custom&startdt=2024-01-01`;
      const ftUrl = `https://efts.sec.gov/LATEST/search-index?q="${encodeURIComponent(symbol)}"&forms=10-K,10-Q,8-K`;

      // Use the EDGAR full-text search
      const edgarUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol.toUpperCase())}%22&forms=10-K,10-Q,8-K`;

      // Simpler approach: use EDGAR company search
      const companyUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=&CIK=${encodeURIComponent(symbol)}&type=10-K%2C10-Q%2C8-K&dateb=&owner=include&count=${limit}&search_text=&action=getcompany&output=atom`;
      const cRes = await fetch(companyUrl, {
        headers: { "User-Agent": "stock-monitor admin@example.com", Accept: "application/atom+xml" },
      });

      if (!cRes.ok) throw new Error(`EDGAR returned ${cRes.status}`);
      const xml = await cRes.text();

      // Parse entries from Atom feed
      const entries: { form: string; date: string; description: string; url: string }[] = [];
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      while ((match = entryRegex.exec(xml)) !== null && entries.length < limit) {
        const entry = match[1];
        const title = entry.match(/<title[^>]*>(.*?)<\/title>/)?.[1] ?? "";
        const updated = entry.match(/<updated>(.*?)<\/updated>/)?.[1] ?? "";
        const link = entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "";
        const summary = entry.match(/<summary[^>]*>(.*?)<\/summary>/)?.[1] ?? "";
        const form = title.match(/^(\S+)/)?.[1] ?? title;
        entries.push({
          form,
          date: updated.split("T")[0],
          description: summary.replace(/<[^>]+>/g, "").slice(0, 200),
          url: link,
        });
      }

      return { filings: entries };
    } catch (err) {
      return {
        filings: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
