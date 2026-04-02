import Database from "better-sqlite3";
import { resolve } from "node:path";

const DB_PATH = resolve(import.meta.dirname, "..", "stock-monitor.db");

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// ===== Schema =====
db.exec(`
  CREATE TABLE IF NOT EXISTS holdings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT NOT NULL,
    stock_name  TEXT NOT NULL DEFAULT '',
    person_name TEXT NOT NULL DEFAULT '',
    household   TEXT NOT NULL DEFAULT '',
    positions   REAL NOT NULL DEFAULT 0,
    strike_price REAL NOT NULL DEFAULT 0
  );
`);

// ===== Seed data (only if table is empty) =====
const count = (db.prepare("SELECT COUNT(*) as c FROM holdings").get() as { c: number }).c;

if (count === 0) {
  const STOCK_NAMES: Record<string, string> = {
    AAPL: "Apple Inc.",
    MSFT: "Microsoft Corp.",
    NVDA: "NVIDIA Corp.",
    AMZN: "Amazon.com Inc.",
    META: "Meta Platforms Inc.",
    GOOGL: "Alphabet Inc.",
    TSLA: "Tesla Inc.",
    "BRK-B": "Berkshire Hathaway Inc.",
    AVGO: "Broadcom Inc.",
    LLY: "Eli Lilly & Co.",
    JPM: "JPMorgan Chase & Co.",
    UNH: "UnitedHealth Group Inc.",
    GS: "Goldman Sachs Group Inc.",
    HD: "Home Depot Inc.",
    AMGN: "Amgen Inc.",
    CAT: "Caterpillar Inc.",
    MCD: "McDonald's Corp.",
    V: "Visa Inc.",
    CRM: "Salesforce Inc.",
    COST: "Costco Wholesale Corp.",
    NFLX: "Netflix Inc.",
    SAP: "SAP SE",
    "^GSPC": "S&P 500 Index",
    "^DJI": "Dow Jones Industrial Average",
    "^IXIC": "NASDAQ Composite",
  };

  // 10 people assigned to 3 households
  const people = [
    { name: "Alice Chen", household: "Evergreen" },
    { name: "Bob Martinez", household: "Evergreen" },
    { name: "Carol Johnson", household: "Evergreen" },
    { name: "David Kim", household: "Pinnacle" },
    { name: "Emily Wright", household: "Pinnacle" },
    { name: "Frank Patel", household: "Pinnacle" },
    { name: "Grace Thompson", household: "Pinnacle" },
    { name: "Henry Nakamura", household: "Horizon" },
    { name: "Irene Costa", household: "Horizon" },
    { name: "James Sullivan", household: "Horizon" },
  ];

  // Tradeable symbols (exclude indexes)
  const tradeable = Object.keys(STOCK_NAMES).filter((s) => !s.startsWith("^"));

  // Deterministic seed assignments — each person gets 3–6 random stocks
  const assignments: { person: string; household: string; symbols: string[] }[] = [
    { person: "Alice Chen", household: "Evergreen", symbols: ["AAPL", "MSFT", "NVDA", "GOOGL", "META"] },
    { person: "Bob Martinez", household: "Evergreen", symbols: ["TSLA", "AMZN", "NFLX", "CRM"] },
    { person: "Carol Johnson", household: "Evergreen", symbols: ["SAP", "BRK-B", "JPM", "V", "GS"] },
    { person: "David Kim", household: "Pinnacle", symbols: ["AVGO", "LLY", "UNH", "COST"] },
    { person: "Emily Wright", household: "Pinnacle", symbols: ["AAPL", "HD", "MCD", "CAT", "AMGN"] },
    { person: "Frank Patel", household: "Pinnacle", symbols: ["MSFT", "META", "NVDA", "NFLX", "CRM"] },
    { person: "Grace Thompson", household: "Pinnacle", symbols: ["TSLA", "AMZN", "GOOGL"] },
    { person: "Henry Nakamura", household: "Horizon", symbols: ["JPM", "GS", "V", "BRK-B", "UNH"] },
    { person: "Irene Costa", household: "Horizon", symbols: ["LLY", "AVGO", "HD", "COST", "SAP"] },
    { person: "James Sullivan", household: "Horizon", symbols: ["MCD", "CAT", "AMGN", "TSLA", "AMZN", "NFLX"] },
  ];

  // Random-ish but deterministic positions and strike prices
  const rng = (seed: number) => {
    let s = seed;
    return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  };
  const rand = rng(42);

  const insert = db.prepare(
    "INSERT INTO holdings (symbol, stock_name, person_name, household, positions, strike_price) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const insertMany = db.transaction(() => {
    // First insert indexes (no person/household)
    for (const sym of ["^GSPC", "^DJI", "^IXIC"]) {
      insert.run(sym, STOCK_NAMES[sym] ?? sym, "", "", 0, 0);
    }

    // Then insert people's holdings
    for (const a of assignments) {
      for (const sym of a.symbols) {
        const positions = Math.round(rand() * 490 + 10); // 10–500 shares
        const basePrice = {
          AAPL: 185, MSFT: 420, NVDA: 880, AMZN: 185, META: 500,
          GOOGL: 170, TSLA: 250, "BRK-B": 415, AVGO: 170, LLY: 780,
          JPM: 200, UNH: 520, GS: 470, HD: 370, AMGN: 290,
          CAT: 350, MCD: 290, V: 280, CRM: 300, COST: 740,
          NFLX: 630, SAP: 200,
        }[sym] ?? 100;
        // Strike = base ± up to 15%
        const strike = +(basePrice * (0.85 + rand() * 0.3)).toFixed(2);
        insert.run(sym, STOCK_NAMES[sym] ?? sym, a.person, a.household, positions, strike);
      }
    }
  });

  insertMany();
  console.log("Database seeded with holdings data.");
}

// ===== Calendar table =====
db.exec(`
  CREATE TABLE IF NOT EXISTS calendar (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    event_date  TEXT NOT NULL,
    event_time  TEXT NOT NULL DEFAULT '',
    reminder    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ===== Query helpers =====

export interface Holding {
  id: number;
  symbol: string;
  stock_name: string;
  person_name: string;
  household: string;
  positions: number;
  strike_price: number;
}

export function getAllHoldings(): Holding[] {
  return db.prepare("SELECT * FROM holdings ORDER BY household, person_name, symbol").all() as Holding[];
}

export function getHoldingsByHousehold(household: string): Holding[] {
  return db.prepare("SELECT * FROM holdings WHERE household = ? ORDER BY person_name, symbol").all(household) as Holding[];
}

export function getHoldingsByPerson(person: string): Holding[] {
  return db.prepare("SELECT * FROM holdings WHERE person_name = ? ORDER BY symbol").all(person) as Holding[];
}

export function getUniqueSymbols(): string[] {
  const rows = db.prepare("SELECT DISTINCT symbol FROM holdings ORDER BY symbol").all() as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

export function getHouseholds(): string[] {
  const rows = db.prepare("SELECT DISTINCT household FROM holdings WHERE household != '' ORDER BY household").all() as { household: string }[];
  return rows.map((r) => r.household);
}

export function getPeople(): string[] {
  const rows = db.prepare("SELECT DISTINCT person_name FROM holdings WHERE person_name != '' ORDER BY person_name").all() as { person_name: string }[];
  return rows.map((r) => r.person_name);
}

export function addHolding(h: Omit<Holding, "id">): Holding[] {
  db.prepare(
    "INSERT INTO holdings (symbol, stock_name, person_name, household, positions, strike_price) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(h.symbol, h.stock_name, h.person_name, h.household, h.positions, h.strike_price);
  return getAllHoldings();
}

export function removeHolding(id: number): Holding[] {
  db.prepare("DELETE FROM holdings WHERE id = ?").run(id);
  return getAllHoldings();
}

export function removeSymbolHoldings(symbol: string): void {
  db.prepare("DELETE FROM holdings WHERE symbol = ?").run(symbol.toUpperCase());
}

export function addSymbolToDb(symbol: string, stockName?: string): void {
  // Check if symbol already exists
  const existing = db.prepare("SELECT id FROM holdings WHERE symbol = ? LIMIT 1").get(symbol) as { id: number } | undefined;
  if (!existing) {
    db.prepare(
      "INSERT INTO holdings (symbol, stock_name, person_name, household, positions, strike_price) VALUES (?, ?, '', '', 0, 0)"
    ).run(symbol, stockName ?? symbol);
  }
}

// ===== Calendar helpers =====

export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  reminder: number;
  created_at: string;
}

export function getCalendarEvents(): CalendarEvent[] {
  return db.prepare("SELECT * FROM calendar ORDER BY event_date, event_time").all() as CalendarEvent[];
}

export function addCalendarEvent(e: Omit<CalendarEvent, "id" | "created_at">): CalendarEvent {
  const result = db.prepare(
    "INSERT INTO calendar (title, description, event_date, event_time, reminder) VALUES (?, ?, ?, ?, ?)"
  ).run(e.title, e.description, e.event_date, e.event_time, e.reminder ? 1 : 0);
  return db.prepare("SELECT * FROM calendar WHERE id = ?").get(result.lastInsertRowid) as CalendarEvent;
}

export function deleteCalendarEvent(id: number): void {
  db.prepare("DELETE FROM calendar WHERE id = ?").run(id);
}

// ===== Alerts table =====
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol        TEXT NOT NULL,
    alert_type    TEXT NOT NULL,
    threshold     REAL NOT NULL DEFAULT 0,
    person_name   TEXT NOT NULL DEFAULT '',
    household     TEXT NOT NULL DEFAULT '',
    enabled       INTEGER NOT NULL DEFAULT 1,
    last_triggered TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface Alert {
  id: number;
  symbol: string;
  alert_type: string;
  threshold: number;
  person_name: string;
  household: string;
  enabled: number;
  last_triggered: string | null;
  created_at: string;
}

export function getAllAlerts(): Alert[] {
  return db.prepare("SELECT * FROM alerts ORDER BY symbol, alert_type").all() as Alert[];
}

export function getEnabledAlerts(): Alert[] {
  return db.prepare("SELECT * FROM alerts WHERE enabled = 1 ORDER BY symbol").all() as Alert[];
}

export function addAlert(a: Omit<Alert, "id" | "created_at" | "last_triggered">): Alert {
  const result = db.prepare(
    "INSERT INTO alerts (symbol, alert_type, threshold, person_name, household, enabled) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(a.symbol, a.alert_type, a.threshold, a.person_name, a.household, a.enabled);
  return db.prepare("SELECT * FROM alerts WHERE id = ?").get(result.lastInsertRowid) as Alert;
}

export function removeAlert(id: number): void {
  db.prepare("DELETE FROM alerts WHERE id = ?").run(id);
}

export function updateAlertTriggered(id: number): void {
  db.prepare("UPDATE alerts SET last_triggered = datetime('now') WHERE id = ?").run(id);
}

export function toggleAlert(id: number, enabled: boolean): void {
  db.prepare("UPDATE alerts SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

// ===== Reports table =====
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    report_type TEXT NOT NULL DEFAULT 'daily',
    content     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface Report {
  id: number;
  title: string;
  report_type: string;
  content: string;
  created_at: string;
}

export function getReports(limit = 20): Report[] {
  return db.prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT ?").all(limit) as Report[];
}

export function addReport(r: Omit<Report, "id" | "created_at">): Report {
  const result = db.prepare(
    "INSERT INTO reports (title, report_type, content) VALUES (?, ?, ?)"
  ).run(r.title, r.report_type, r.content);
  return db.prepare("SELECT * FROM reports WHERE id = ?").get(result.lastInsertRowid) as Report;
}

export function removeReport(id: number): void {
  db.prepare("DELETE FROM reports WHERE id = ?").run(id);
}

export default db;
