import express, { type Request, type Response } from "express";
import { resolve } from "node:path";
import { loadSymbols, addSymbol, removeSymbol } from "./symbols.js";
import { getAllHoldings, getHouseholds, getPeople, addHolding, removeHolding, type Holding, getCalendarEvents, getAllAlerts, removeAlert as dbRemoveAlert, toggleAlert as dbToggleAlert, getReports, removeReport as dbRemoveReport } from "./db.js";

const app = express();
app.use(express.json());
app.use(express.static(resolve(import.meta.dirname, "..", "public")));

// --- Types (declared early for cache) ---
export interface NewsArticle {
  symbol: string;
  title: string;
  summary: string;
  impact: "positive" | "negative" | "neutral";
  source: string;
  pubDate: string;
  link: string;
  crossRef: string[];
}

// --- SSE broadcasting ---
type SSEClient = { id: number; res: Response };
let clientId = 0;
const clients: SSEClient[] = [];

// Cache latest data so new clients get it immediately
let lastPricesData: string | null = null;
let lastNewsArticles: NewsArticle[] = [];

export function broadcast(message: string): void {
  const data = JSON.stringify({ text: message, ts: Date.now() });
  for (const client of clients) {
    client.res.write(`event: log\ndata: ${data}\n\n`);
  }
}

export interface PriceRow {
  symbol: string;
  previous: number | null;
  current: number;
  changePct: number | null;
  open: number;
  previousClose: number;
  dayPct: number;
  belowOpen: boolean;
  changed: boolean;
}

export function broadcastPrices(rows: PriceRow[], lastUpdated: string): void {
  const data = JSON.stringify({ rows, lastUpdated });
  lastPricesData = data;
  for (const client of clients) {
    client.res.write(`event: prices\ndata: ${data}\n\n`);
  }
}

export function broadcastNews(articles: NewsArticle[], lastUpdated: string): void {
  const data = JSON.stringify({ articles, lastUpdated });
  for (const client of clients) {
    client.res.write(`event: news\ndata: ${data}\n\n`);
  }
}

export function broadcastNewsClear(): void {
  lastNewsArticles = [];
  for (const client of clients) {
    client.res.write(`event: news-clear\ndata: {}\n\n`);
  }
}

export function broadcastNewsStatus(message: string): void {
  const data = JSON.stringify({ message });
  for (const client of clients) {
    client.res.write(`event: news-status\ndata: ${data}\n\n`);
  }
}

export function broadcastNewsAppend(articles: NewsArticle[], lastUpdated: string): void {
  lastNewsArticles.push(...articles);
  const data = JSON.stringify({ articles, lastUpdated });
  for (const client of clients) {
    client.res.write(`event: news-append\ndata: ${data}\n\n`);
  }
}

// Intercept console.log to also broadcast
const originalLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const message = args.map(String).join(" ");
  originalLog(...args);
  broadcast(message);
};

const originalError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const message = args.map(String).join(" ");
  originalError(...args);
  broadcast(`[ERROR] ${message}`);
};

// --- SSE endpoint ---
app.get("/api/logs", (_req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");

  // Send cached data immediately so new clients don't wait
  if (lastPricesData) {
    res.write(`event: prices\ndata: ${lastPricesData}\n\n`);
  }
  if (lastNewsArticles.length > 0) {
    const newsData = JSON.stringify({ articles: lastNewsArticles, lastUpdated: new Date().toLocaleTimeString() });
    res.write(`event: news\ndata: ${newsData}\n\n`);
  }

  const id = ++clientId;
  clients.push({ id, res });

  // If no cached data yet, trigger immediate fetch for this first client
  if (!firstClientHandled && lastNewsArticles.length === 0 && onFirstClient) {
    firstClientHandled = true;
    onFirstClient();
  }

  _req.on("close", () => {
    const idx = clients.findIndex((c) => c.id === id);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

// --- Symbols API ---
app.get("/api/symbols", (_req: Request, res: Response) => {
  res.json({ symbols: loadSymbols() });
});

app.post("/api/symbols", (req: Request, res: Response) => {
  const { symbol } = req.body as { symbol?: string };
  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  const symbols = addSymbol(symbol.trim());
  res.json({ symbols });
});

app.delete("/api/symbols/:symbol", (req: Request, res: Response) => {
  const symbols = removeSymbol(req.params.symbol);
  res.json({ symbols });
});

// --- Price Interval API ---
let currentIntervalMs = 10_000;
let onIntervalChange: ((ms: number) => void) | null = null;

export function setIntervalChangeHandler(handler: (ms: number) => void): void {
  onIntervalChange = handler;
}

export function getCurrentInterval(): number {
  return currentIntervalMs;
}

app.get("/api/interval", (_req: Request, res: Response) => {
  res.json({ intervalMs: currentIntervalMs });
});

app.post("/api/interval", (req: Request, res: Response) => {
  const { intervalMs } = req.body as { intervalMs?: number };
  if (!intervalMs || typeof intervalMs !== "number" || intervalMs < 5000) {
    res.status(400).json({ error: "intervalMs must be a number >= 5000" });
    return;
  }
  currentIntervalMs = intervalMs;
  if (onIntervalChange) onIntervalChange(intervalMs);
  res.json({ intervalMs: currentIntervalMs });
});

// --- News Interval API ---
let newsIntervalMs = 60_000;
let onNewsIntervalChange: ((ms: number) => void) | null = null;
let onNewsRefreshNow: (() => void) | null = null;
let onFirstClient: (() => void) | null = null;
let firstClientHandled = false;

export function setNewsIntervalChangeHandler(handler: (ms: number) => void): void {
  onNewsIntervalChange = handler;
}

export function setNewsRefreshNowHandler(handler: () => void): void {
  onNewsRefreshNow = handler;
}

export function setFirstClientHandler(handler: () => void): void {
  onFirstClient = handler;
}

export function getNewsInterval(): number {
  return newsIntervalMs;
}

app.get("/api/news-interval", (_req: Request, res: Response) => {
  res.json({ intervalMs: newsIntervalMs });
});

app.post("/api/news-interval", (req: Request, res: Response) => {
  const { intervalMs } = req.body as { intervalMs?: number };
  if (!intervalMs || typeof intervalMs !== "number" || intervalMs < 5000) {
    res.status(400).json({ error: "intervalMs must be a number >= 5000" });
    return;
  }
  newsIntervalMs = intervalMs;
  if (onNewsIntervalChange) onNewsIntervalChange(intervalMs);
  res.json({ intervalMs: newsIntervalMs });
});

app.post("/api/news-refresh", (_req: Request, res: Response) => {
  if (onNewsRefreshNow) onNewsRefreshNow();
  res.json({ ok: true });
});

// --- Holdings API ---
app.get("/api/holdings", (_req: Request, res: Response) => {
  res.json({ holdings: getAllHoldings(), households: getHouseholds(), people: getPeople() });
});

app.post("/api/holdings", (req: Request, res: Response) => {
  const h = req.body as Partial<Holding>;
  if (!h.symbol) { res.status(400).json({ error: "symbol is required" }); return; }
  const holdings = addHolding({
    symbol: h.symbol.toUpperCase(),
    stock_name: h.stock_name ?? "",
    person_name: h.person_name ?? "",
    household: h.household ?? "",
    positions: h.positions ?? 0,
    strike_price: h.strike_price ?? 0,
  });
  res.json({ holdings });
});

app.delete("/api/holdings/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const holdings = removeHolding(id);
  res.json({ holdings });
});

// --- Advisor API ---
type AdvisorHandler = (prompt: string) => Promise<string>;
let onAdvisorRequest: AdvisorHandler | null = null;

export function setAdvisorHandler(handler: AdvisorHandler): void {
  onAdvisorRequest = handler;
}

app.post("/api/advisor", async (req: Request, res: Response) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt) { res.status(400).json({ error: "prompt is required" }); return; }
  if (!onAdvisorRequest) { res.status(503).json({ error: "advisor not ready" }); return; }
  try {
    const result = await onAdvisorRequest(prompt);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// --- Email Agent API ---
type EmailHandler = (prompt: string) => Promise<string>;
let onEmailRequest: EmailHandler | null = null;

export function setEmailHandler(handler: EmailHandler): void {
  onEmailRequest = handler;
}

app.post("/api/email", async (req: Request, res: Response) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt) { res.status(400).json({ error: "prompt is required" }); return; }
  if (!onEmailRequest) { res.status(503).json({ error: "email agent not ready" }); return; }
  try {
    const result = await onEmailRequest(prompt);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// --- Chat Agent API ---
type ChatHandler = (agent: string, message: string, history: { role: string; content: string }[]) => Promise<string>;
let onChatRequest: ChatHandler | null = null;

export function setChatHandler(handler: ChatHandler): void {
  onChatRequest = handler;
}

app.post("/api/chat", async (req: Request, res: Response) => {
  const { agent, message, history } = req.body as {
    agent?: string;
    message?: string;
    history?: { role: string; content: string }[];
  };
  if (!agent || !message) { res.status(400).json({ error: "agent and message required" }); return; }
  if (!onChatRequest) { res.status(503).json({ error: "chat not ready" }); return; }
  try {
    const result = await onChatRequest(agent, message, history ?? []);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// --- Agent API (generic handler for multiple agents) ---
type AgentHandler = (prompt: string) => Promise<string>;
const agentHandlers: Record<string, AgentHandler> = {};

export function setAgentHandler(name: string, handler: AgentHandler): void {
  agentHandlers[name] = handler;
}

app.post("/api/agent/:name", async (req: Request, res: Response) => {
  const name = req.params.name as string;
  const { prompt } = req.body as { prompt?: string };
  if (!prompt) { res.status(400).json({ error: "prompt is required" }); return; }
  const handler = agentHandlers[name];
  if (!handler) { res.status(404).json({ error: `agent '${name}' not found` }); return; }
  try {
    const result = await handler(prompt);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// --- Alerts API (CRUD) ---

app.get("/api/alerts", (_req: Request, res: Response) => {
  res.json({ alerts: getAllAlerts() });
});

app.delete("/api/alerts/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  dbRemoveAlert(id);
  res.json({ alerts: getAllAlerts() });
});

app.post("/api/alerts/:id/toggle", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const { enabled } = req.body as { enabled?: boolean };
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  dbToggleAlert(id, enabled ?? true);
  res.json({ alerts: getAllAlerts() });
});

// --- Reports API ---
app.get("/api/reports", (_req: Request, res: Response) => {
  res.json({ reports: getReports(20) });
});

app.delete("/api/reports/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  dbRemoveReport(id);
  res.json({ reports: getReports(20) });
});

// --- Calendar API (direct, for UI listing) ---
app.get("/api/calendar", (_req: Request, res: Response) => {
  res.json({ events: getCalendarEvents() });
});

export function startServer(port = 2404): void {
  app.listen(port, () => {
    originalLog(`\n  Web UI available at http://localhost:${port}\n`);
  });
}
