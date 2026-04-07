import { Mastra } from "@mastra/core";
import { stockMonitorAgent } from "./agents/stock-monitor.js";
import { newsAnalystAgent } from "./agents/news-analyst.js";
import { advisorAgent } from "./agents/advisor.js";
import { calendarAgent } from "./agents/calendar.js";
import { chatAgent } from "./agents/chat.js";
import { emailAgent } from "./agents/email.js";
import { alertsAgent } from "./agents/alerts.js";
import { researchAgent } from "./agents/research.js";
import { rebalanceAgent } from "./agents/rebalance.js";
import { reportingAgent } from "./agents/reporting.js";
import { sentimentAgent } from "./agents/sentiment.js";
import { tickerAgent } from "./agents/ticker.js";
import { countdownAgent } from "./agents/countdown.js";
import { alertActionsAgent } from "./agents/alert-actions.js";
import { tradeAnalysisAgent } from "./agents/trade-analysis.js";
import { newsLookupAgent } from "./agents/news-lookup.js";
import { initDb } from "./db.js";
import { updateAlertPriceMap } from "./tools/alerts.js";
import { loadSymbols } from "./symbols.js";
import { fetchNewsForSymbol } from "./tools/fetch-news.js";
import { updatePriceMap } from "./tools/market-query.js";
import {
  startServer,
  setIntervalChangeHandler,
  getCurrentInterval,
  broadcastPrices,
  broadcastNewsClear,
  broadcastNewsAppend,
  broadcastNewsStatus,
  setNewsIntervalChangeHandler,
  setNewsRefreshNowHandler,
  setPriceRefreshNowHandler,
  setFirstClientHandler,
  setAdvisorHandler,
  setChatHandler,
  setEmailHandler,
  setAgentHandler,
  getNewsInterval,
  broadcastTicker,
  broadcastCountdown,
  type PriceRow,
  type NewsArticle,
  type TickerItem,
} from "./server.js";

// --- Configuration ---
const CHANGE_THRESHOLD = 0.01; // 0.01% change threshold
const INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"]; // S&P 500, Dow 30, Nasdaq

// --- Types ---
interface StockData {
  symbol: string;
  price: number;
  open: number;
  previousClose: number;
}

// --- State ---
const previousPrices: Record<string, number> = {};
const currentData: Record<string, StockData> = {};
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let newsTimer: ReturnType<typeof setTimeout> | null = null;

// --- Mastra setup ---
const mastra = new Mastra({
  agents: { stockMonitorAgent, newsAnalystAgent, advisorAgent, calendarAgent, chatAgent, emailAgent, alertsAgent, researchAgent, rebalanceAgent, reportingAgent, sentimentAgent, tickerAgent, countdownAgent, alertActionsAgent, tradeAnalysisAgent, newsLookupAgent },
});

const priceAgent = mastra.getAgent("stockMonitorAgent");
const newsAgent = mastra.getAgent("newsAnalystAgent");

// ============================================================
// PRICE MONITORING
// ============================================================

function extractStockData(obj: unknown, symbols: string[], depth = 0): void {
  if (depth > 10 || obj === null || obj === undefined) return;
  if (typeof obj !== "object") return;

  const record = obj as Record<string, unknown>;

  if (
    typeof record.symbol === "string" &&
    typeof record.price === "number" &&
    symbols.includes(record.symbol)
  ) {
    currentData[record.symbol] = {
      symbol: record.symbol,
      price: record.price,
      open: typeof record.open === "number" ? record.open : 0,
      previousClose:
        typeof record.previousClose === "number" ? record.previousClose : 0,
    };
    return;
  }

  if (
    record.toolName === "getStockPrice" &&
    record.result &&
    typeof record.result === "object"
  ) {
    extractStockData(record.result, symbols, depth + 1);
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractStockData(item, symbols, depth + 1);
    }
  } else {
    for (const value of Object.values(record)) {
      extractStockData(value, symbols, depth + 1);
    }
  }
}

function pad(str: string, len: number): string {
  return str.padEnd(len);
}

function rpad(str: string, len: number): string {
  return str.padStart(len);
}

function fmtPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

function printTable(symbols: string[], isInitial: boolean): void {
  const symW = 8;
  const priceW = 12;

  if (isInitial) {
    console.log(
      `  ${pad("Symbol", symW)}  ${rpad("Previous", priceW)}  ${rpad("Current", priceW)}  ${rpad("Open", priceW)}  ${rpad("Day %", priceW)}`
    );
    console.log(`  ${"─".repeat(symW + priceW * 4 + 10)}`);
    for (const sym of symbols) {
      const d = currentData[sym];
      if (!d) {
        console.log(
          `  ${pad(sym, symW)}  ${"N/A".padStart(priceW)}  ${"N/A".padStart(priceW)}  ${"N/A".padStart(priceW)}  ${"N/A".padStart(priceW)}`
        );
      } else {
        const dayPct = d.open !== 0 ? ((d.price - d.open) / d.open) * 100 : 0;
        const daySign = dayPct >= 0 ? "+" : "";
        const belowOpen = d.price < d.open ? "[BELOW_OPEN] " : "";
        console.log(
          `${belowOpen}  ${pad(sym, symW)}  ${rpad("--", priceW)}  ${rpad(fmtPrice(d.price), priceW)}  ${rpad(fmtPrice(d.open), priceW)}  ${rpad(`${daySign}${dayPct.toFixed(4)}%`, priceW)}`
        );
      }
    }
  } else {
    console.log(
      `  ${pad("Symbol", symW)}  ${rpad("Previous", priceW)}  ${rpad("Current", priceW)}  ${rpad("Change %", priceW)}  ${rpad("Open", priceW)}  ${rpad("Day %", priceW)}`
    );
    console.log(`  ${"─".repeat(symW + priceW * 5 + 12)}`);

    let anyChange = false;
    for (const sym of symbols) {
      const d = currentData[sym];
      const prev = previousPrices[sym];
      if (!d) {
        console.log(
          `  ${pad(sym, symW)}  ${"N/A".padStart(priceW)}  ${"N/A".padStart(priceW)}  ${"N/A".padStart(priceW)}  ${"N/A".padStart(priceW)}  ${"N/A".padStart(priceW)}`
        );
        continue;
      }
      const pctChange =
        prev !== undefined ? ((d.price - prev) / prev) * 100 : 0;
      const sign = pctChange >= 0 ? "+" : "";
      const changeStr = `${sign}${pctChange.toFixed(4)}%`;
      const changed = Math.abs(pctChange) >= CHANGE_THRESHOLD;
      const marker = changed ? " *" : "";

      const dayPct = d.open !== 0 ? ((d.price - d.open) / d.open) * 100 : 0;
      const daySign = dayPct >= 0 ? "+" : "";

      if (changed) anyChange = true;

      const belowOpen = d.price < d.open ? "[BELOW_OPEN] " : "";
      console.log(
        `${belowOpen}  ${pad(sym, symW)}  ${rpad(prev !== undefined ? fmtPrice(prev) : "--", priceW)}  ${rpad(fmtPrice(d.price), priceW)}  ${rpad(changeStr, priceW)}  ${rpad(fmtPrice(d.open), priceW)}  ${rpad(`${daySign}${dayPct.toFixed(4)}%`, priceW)}${marker}`
      );
    }

    if (!anyChange) {
      console.log(
        `\n  No significant changes detected (threshold: ±${CHANGE_THRESHOLD}%)`
      );
    } else {
      console.log(`\n  * = change >= ±${CHANGE_THRESHOLD}%`);
    }
  }
}

async function checkPrices(): Promise<void> {
  const holdingSymbols = await loadSymbols();
  const symbols = [...new Set([...holdingSymbols, ...INDEX_SYMBOLS])].sort((a, b) =>
    a.replace(/^\^/, "").localeCompare(b.replace(/^\^/, ""))
  );
  const isInitial = symbols.some((s) => previousPrices[s] === undefined);

  const prompt = `Fetch the current stock prices for: ${symbols.join(", ")}`;

  console.log(`\n${"=".repeat(72)}`);
  console.log(
    `  [${new Date().toLocaleTimeString()}] ${isInitial ? "Initial price fetch" : "Checking for price changes"}...`
  );
  console.log(`${"=".repeat(72)}`);

  const response = await priceAgent.generate([
    { role: "user", content: prompt },
  ]);

  extractStockData(response as unknown, symbols);
  printTable(symbols, isInitial);

  // Broadcast structured data to web UI
  const rows: PriceRow[] = symbols.map((sym) => {
    const d = currentData[sym];
    if (!d) {
      return {
        symbol: sym,
        previous: null,
        current: 0,
        changePct: null,
        open: 0,
        previousClose: 0,
        dayPct: 0,
        belowOpen: false,
        changed: false,
      };
    }
    const prev = previousPrices[sym] ?? null;
    const pctChange = prev !== null ? ((d.price - prev) / prev) * 100 : null;
    const dayPct = d.open !== 0 ? ((d.price - d.open) / d.open) * 100 : 0;
    return {
      symbol: sym,
      previous: prev,
      current: d.price,
      changePct: pctChange,
      open: d.open,
      previousClose: d.previousClose,
      dayPct,
      belowOpen: d.price < d.open,
      changed: pctChange !== null && Math.abs(pctChange) >= CHANGE_THRESHOLD,
    };
  });
  broadcastPrices(rows, new Date().toLocaleTimeString());

  // Update shared price map for market-query tool
  const pm: Record<string, number> = {};
  for (const r of rows) { if (r.current) pm[r.symbol] = r.current; }
  updatePriceMap(pm);
  updateAlertPriceMap(pm);

  // Update previous prices
  for (const sym of symbols) {
    if (currentData[sym]) {
      previousPrices[sym] = currentData[sym].price;
    }
  }

  // Fire ticker agent in background (don't block price loop)
  generateTickerCommentary(rows).catch((err) =>
    console.error("Ticker agent error:", err)
  );
}

// ============================================================
// TICKER AGENT
// ============================================================

const tickerAgentInstance = mastra.getAgent("tickerAgent");

async function generateTickerCommentary(rows: PriceRow[]): Promise<void> {
  const priceLines = rows
    .filter((r) => r.current > 0)
    .map((r) => {
      const dayStr = r.dayPct !== 0 ? `${r.dayPct >= 0 ? "+" : ""}${r.dayPct.toFixed(2)}%` : "flat";
      return `${r.symbol}: $${r.current.toFixed(2)} (day: ${dayStr})`;
    })
    .join("\n");

  const prompt = `Current prices:\n${priceLines}\n\nGenerate ticker commentary for each symbol.`;

  const t0 = Date.now();
  const response = await tickerAgentInstance.generate([
    { role: "user", content: prompt },
  ]);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  try {
    const text = response.text.trim();
    const jsonStr = text.startsWith("```")
      ? text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      : text;
    const items: TickerItem[] = JSON.parse(jsonStr);
    broadcastTicker(items);
    console.log(`  Ticker agent: ${items.length} items in ${elapsed}s`);
  } catch {
    // Try to extract JSON array from response
    const match = response.text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const items: TickerItem[] = JSON.parse(match[0]);
        broadcastTicker(items);
        console.log(`  Ticker agent: ${items.length} items in ${elapsed}s`);
      } catch {
        console.error("  Ticker agent: failed to parse response");
      }
    }
  }
}

function schedulePricePoll(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    try {
      await checkPrices();
    } catch (error) {
      console.error("Error checking prices:", error);
    }
    schedulePricePoll();
  }, getCurrentInterval());
}

// ============================================================
// NEWS ANALYSIS
// ============================================================

function parseNewsResponse(text: string): NewsArticle[] {
  try {
    const trimmed = text.trim();
    const jsonStr = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      : trimmed;
    return JSON.parse(jsonStr) as NewsArticle[];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]) as NewsArticle[]; } catch { /* ignore */ }
    }
    return [];
  }
}

const BATCH_SIZE = 4; // symbols per batch

async function fetchAndAnalyzeNews(): Promise<void> {
  const symbols = (await loadSymbols()).sort((a, b) =>
    a.replace(/^\^/, "").localeCompare(b.replace(/^\^/, ""))
  );

  const t0 = Date.now();
  console.log(`\n  [${new Date().toLocaleTimeString()}] Streaming news for ${symbols.length} symbols...`);

  // Keep old news visible until new data arrives
  let newsCleared = false;
  broadcastNewsStatus(`Fetching RSS feeds for ${symbols.length} symbols...`);

  // Step 1: Fetch ALL RSS feeds in parallel (this is the fast part)
  const feedResults = await Promise.all(
    symbols.map((sym) => fetchNewsForSymbol(sym, 5))
  );

  let totalHeadlines = 0;
  for (const f of feedResults) totalHeadlines += f.articles.length;

  const fetchTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  RSS fetched: ${totalHeadlines} headlines in ${fetchTime}s`);
  broadcastNewsStatus(`Fetched ${totalHeadlines} headlines in ${fetchTime}s — sending to AI for analysis...`);

  // Step 2: Process in batches through the AI
  const batches: typeof feedResults[] = [];
  for (let i = 0; i < feedResults.length; i += BATCH_SIZE) {
    batches.push(feedResults.slice(i, i + BATCH_SIZE));
  }

  let totalFound = 0;
  let batchNum = 0;

  for (const batch of batches) {
    batchNum++;
    const batchSymbols = batch.map((f) => f.symbol);

    const headlineLines: string[] = [];
    for (const feed of batch) {
      for (const a of feed.articles) {
        headlineLines.push(
          `[${feed.symbol}] ${a.title} | source: ${a.source} | date: ${a.pubDate} | link: ${a.link}`
        );
      }
    }

    if (headlineLines.length === 0) continue;

    broadcastNewsStatus(`Analyzing batch ${batchNum}/${batches.length}: ${batchSymbols.join(", ")}...`);

    const prompt = `Watchlist symbols: ${symbols.join(", ")}

Analyze these headlines. Return ONLY the JSON array as specified in your instructions.
Keep only the most relevant items (max 5 for this batch).

${headlineLines.join("\n")}`;

    try {
      const t1 = Date.now();
      const response = await newsAgent.generate([
        { role: "user", content: prompt },
      ]);
      const aiTime = ((Date.now() - t1) / 1000).toFixed(1);

      const articles = parseNewsResponse(response.text);
      if (articles.length > 0) {
        if (!newsCleared) {
          broadcastNewsClear();
          newsCleared = true;
        }
        totalFound += articles.length;
        broadcastNewsAppend(articles, new Date().toLocaleTimeString());
        console.log(`  +${articles.length} articles (${batchSymbols.join(", ")}) in ${aiTime}s`);
      } else {
        console.log(`  0 relevant (${batchSymbols.join(", ")}) in ${aiTime}s`);
      }
    } catch (error) {
      console.error(`  News batch error (${batchSymbols.join(", ")}):`, error);
      broadcastNewsStatus(`Error analyzing ${batchSymbols.join(", ")} — skipping`);
    }
  }

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  News complete: ${totalFound} articles in ${totalTime}s`);
  broadcastNewsStatus(`Done — ${totalFound} articles in ${totalTime}s`);

  // Start countdown immediately with default message, then update with agent commentary
  const countdownStartedAt = Date.now();
  broadcastCountdown(getNewsInterval(), "Next news scan...", countdownStartedAt);

  // Fire countdown agent in background to replace the default message (keep same start time)
  generateCountdownMessage(countdownStartedAt).catch((err) =>
    console.error("Countdown agent error:", err)
  );
}

// ============================================================
// COUNTDOWN AGENT
// ============================================================

const countdownAgentInstance = mastra.getAgent("countdownAgent");

async function generateCountdownMessage(startedAt: number): Promise<void> {
  const interval = getNewsInterval();
  const prompt = `News scan just completed. Generate a status message for the countdown to the next scan (${interval / 1000}s interval). Use the tools to check current portfolio state.`;

  const t0 = Date.now();
  const response = await countdownAgentInstance.generate([
    { role: "user", content: prompt },
  ]);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  let message = "Monitoring portfolio positions...";
  try {
    const text = response.text.trim();
    const jsonStr = text.startsWith("```")
      ? text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      : text;
    const parsed = JSON.parse(jsonStr);
    if (parsed.message) message = parsed.message;
  } catch {
    const match = response.text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.message) message = parsed.message;
      } catch { /* use default */ }
    }
  }

  console.log(`  Countdown agent: "${message}" in ${elapsed}s`);
  // Reuse original startedAt so the seconds don't jump back
  broadcastCountdown(interval, message, startedAt);
}

function scheduleNewsPoll(): void {
  if (newsTimer) clearTimeout(newsTimer);
  newsTimer = setTimeout(async () => {
    await fetchAndAnalyzeNews();
    scheduleNewsPoll();
  }, getNewsInterval());
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  await initDb();
  startServer(2404);

  // Price interval changes
  setIntervalChangeHandler((ms) => {
    console.log(`  Price interval changed to ${ms / 1000}s`);
    schedulePricePoll();
  });

  // News interval changes
  setNewsIntervalChangeHandler((ms) => {
    console.log(`  News interval changed to ${ms / 1000}s`);
    scheduleNewsPoll();
  });

  // Immediate news refresh from UI
  setNewsRefreshNowHandler(() => {
    console.log(`  [${new Date().toLocaleTimeString()}] Manual news refresh triggered`);
    fetchAndAnalyzeNews();
    scheduleNewsPoll(); // reset timer
  });

  // Immediate price refresh from UI
  setPriceRefreshNowHandler(() => {
    console.log(`  [${new Date().toLocaleTimeString()}] Manual price refresh triggered`);
    checkPrices().catch(console.error);
    schedulePricePoll(); // reset timer
  });

  // Advisor agent handler
  const advisor = mastra.getAgent("advisorAgent");
  setAdvisorHandler(async (prompt: string) => {
    const response = await advisor.generate([{ role: "user", content: prompt }]);
    return response.text;
  });

  // Email agent handler
  const emAgent = mastra.getAgent("emailAgent");
  setEmailHandler(async (prompt: string) => {
    const response = await emAgent.generate([{ role: "user", content: prompt }]);
    return response.text;
  });

  // Register new agents via generic handler
  const agentMap: Record<string, string> = {
    advisor: "advisorAgent",
    alerts: "alertsAgent",
    research: "researchAgent",
    rebalance: "rebalanceAgent",
    reporting: "reportingAgent",
    sentiment: "sentimentAgent",
    "alert-actions": "alertActionsAgent",
    "trade-analysis": "tradeAnalysisAgent",
    "news-lookup": "newsLookupAgent",
  };
  for (const [name, agentId] of Object.entries(agentMap)) {
    const agent = mastra.getAgent(agentId);
    setAgentHandler(name, async (prompt: string, threadId: string) => {
      const response = await agent.generate([{ role: "user", content: prompt }], {
        memory: {
          thread: `${name}-${threadId}`,
          resource: "dashboard-user",
        },
      });
      return response.text;
    });
  }

  // Chat agent handler (calendar + ad-hoc chat)
  const calAgent = mastra.getAgent("calendarAgent");
  const chAgent = mastra.getAgent("chatAgent");
  const today = () => new Date().toISOString().split("T")[0];

  setChatHandler(async (agentName: string, message: string, threadId: string) => {
    const agent = agentName === "calendar" ? calAgent : chAgent;
    const systemDate = `Today's date is ${today()}.`;
    const response = await agent.generate([{ role: "user", content: `${systemDate}\n\n${message}` }], {
      memory: {
        thread: `${agentName}-${threadId}`,
        resource: "dashboard-user",
      },
    });
    return response.text;
  });

  const symbols = (await loadSymbols()).sort((a, b) =>
    a.replace(/^\^/, "").localeCompare(b.replace(/^\^/, ""))
  );
  console.log(
    "╔════════════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║                    Stock Price Monitor (Mastra Agents)               ║"
  );
  console.log(
    "╠════════════════════════════════════════════════════════════════════════╣"
  );
  console.log(`║  Symbols:    ${symbols.join(", ").padEnd(57)}║`);
  console.log(`║  Threshold:  ±${CHANGE_THRESHOLD}% change`.padEnd(73) + "║");
  console.log(
    `║  Price int:  ${getCurrentInterval() / 1000}s`.padEnd(73) + "║"
  );
  console.log(
    `║  News int:   ${getNewsInterval() / 1000}s`.padEnd(73) + "║"
  );
  console.log(
    "╠════════════════════════════════════════════════════════════════════════╣"
  );
  console.log(
    "║  Agents: Stock Monitor Agent, News Analyst Agent                     ║"
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════════════╝"
  );

  // Prices fire immediately
  checkPrices().then(() => schedulePricePoll()).catch(console.error);

  // News: fetch immediately AND when first browser client connects (in case it missed the initial broadcast)
  fetchAndAnalyzeNews().then(() => scheduleNewsPoll()).catch(console.error);
  setFirstClientHandler(() => {
    console.log("  First client connected — triggering news fetch");
    fetchAndAnalyzeNews();
    scheduleNewsPoll();
  });
}

main().catch(console.error);
