# Stock Monitor

A real-time stock monitoring dashboard for financial advisors, built with [Mastra.ai](https://mastra.ai) agents on AWS Bedrock. The application demonstrates agentic AI capabilities with 16 specialized agents, a scrollable web UI with live SSE data streaming, and a SQLite-backed portfolio database.

## Getting Started

```bash
npm install
npm start
```

The web UI is available at `http://localhost:2404`.

### Environment Variables

| Variable | Description |
|---|---|
| `AWS_REGION` | AWS region (default: `us-east-1`) |
| `AWS_PROFILE` | AWS credentials profile for Bedrock access |
| `BEDROCK_MODEL_ID` | Model ID for the Stock Monitor Agent (default: `us.anthropic.claude-opus-4-6-v1`) |

## Architecture

- **Runtime**: Node.js with TypeScript (tsx)
- **AI Framework**: Mastra.ai with AWS Bedrock (Claude models)
- **Web Server**: Express.js with Server-Sent Events (SSE) for real-time updates
- **Database**: SQLite (better-sqlite3) for holdings, alerts, calendar events, and reports
- **Frontend**: Single-page HTML/CSS/JS dashboard (no build step)

### Data Flow

1. **Price Loop** — Stock Monitor Agent fetches prices via Yahoo Finance tool on a configurable interval (default 10s). Prices broadcast to all connected clients via SSE.
2. **News Loop** — RSS feeds fetched in parallel, then batched through the News Analyst Agent for AI analysis on a separate interval (default 60s).
3. **Ticker & Countdown** — After each price check, the Ticker Agent generates market commentary. After each news scan, the Countdown Agent generates a contextual status message.
4. **Interactive Agents** — Users interact with agents through the AI Chat panel. Messages are auto-routed to the appropriate agent based on keyword detection.

### Portfolio Structure

- 10 people across 3 households: Evergreen, Pinnacle, and Horizon
- Holdings stored in SQLite with symbol, stock name, person, household, positions, and strike price
- Symbols list derived dynamically from the holdings database

## Mastra Agents

### 1. Stock Monitor Agent
- **Model**: Claude Opus on Bedrock
- **File**: `src/agents/stock-monitor.ts`
- **Tools**: `getStockPrice` (Yahoo Finance)
- **Purpose**: Fetches real-time stock prices for all portfolio symbols plus market indexes (S&P 500, Dow 30, Nasdaq). Runs on a configurable polling interval. This is the only agent using Opus for maximum accuracy on price data.

### 2. News Analyst Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/news-analyst.ts`
- **Tools**: None (receives pre-fetched RSS headlines as text)
- **Purpose**: Analyzes pre-fetched Google News RSS headlines for portfolio symbols. Filters for relevance (earnings, analyst actions, M&A, regulatory events), rates impact as positive/negative/neutral, and flags cross-symbol references. RSS feeds are fetched in parallel in code then passed to the agent in batches for speed.

### 3. Financial Advisor Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/advisor.ts`
- **Tools**: None
- **Purpose**: Composes professional client communications and performs trading analysis. Provides actionable insights with market data context, risk assessment, and strategy recommendations.

### 4. Calendar Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/calendar.ts`
- **Tools**: `listEvents`, `createEvent`, `removeEvent`
- **Purpose**: Manages schedule, appointments, and reminders. Handles relative date parsing ("next Tuesday") and persists events to SQLite.

### 5. Chat Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/chat.ts`
- **Tools**: `listEvents`, `createEvent`, `removeEvent`, `getWeather`, `queryPortfolio`, `queryPrices`
- **Purpose**: General-purpose financial assistant. Answers market questions, manages calendar, fetches weather, and queries portfolio data. Acts as the default agent when no specific agent matches the user's message.

### 6. Email Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/email.ts`
- **Tools**: `sendEmail` (AWS SES), `queryPortfolio`, `queryPrices`
- **Purpose**: Composes and sends professional client advisement emails. Pulls current position data (shares, entry price, current price, P/L) and includes market context with disclaimers.

### 7. Alerts Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/alerts.ts`
- **Tools**: `listAlerts`, `createAlert`, `deleteAlert`, `checkAlerts`, `queryPortfolio`, `queryPrices`
- **Purpose**: Manages price and portfolio alerts through conversational CRUD. Supports six alert types: price above/below, P/L above/below, and daily change above/below. Checks alerts against live price data.

### 8. Research Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/research.ts`
- **Tools**: `fetchCompanyProfile` (Yahoo Finance), `fetchSECFilings` (EDGAR), `fetchRedditSentiment`, `queryPortfolio`, `queryPrices`
- **Purpose**: Deep stock research analyst. Generates comprehensive reports covering company profile, SEC filings, social sentiment, valuation assessment, risk factors, and a summary rating (Strong Buy through Strong Sell).

### 9. Rebalance Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/rebalance.ts`
- **Tools**: `fetchCompanyProfile`, `queryPortfolio`, `queryPrices`
- **Purpose**: Portfolio rebalancing specialist. Analyzes composition, concentration risk, sector exposure, and performance. Recommends specific trades with share counts to achieve target allocations.

### 10. Reporting Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/reporting.ts`
- **Tools**: `queryPortfolio`, `queryPrices`, `listReports`, `saveReport`, `deleteReport`, `sendEmail`
- **Purpose**: Generates and persists professional portfolio reports (daily summary, weekly review, performance, risk, custom). Can save reports to the database and email them via AWS SES.

### 11. Sentiment Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/sentiment.ts`
- **Tools**: `fetchRedditSentiment`, `fetchStockTwitsSentiment`, `queryPortfolio`, `queryPrices`
- **Purpose**: Social media sentiment analyst. Aggregates Reddit and StockTwits data to assess retail investor sentiment, identifies key narratives, flags contrarian indicators at extreme sentiment levels.

### 12. Ticker Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/ticker.ts`
- **Tools**: `queryPrices`, `queryPortfolio`
- **Purpose**: Generates short, punchy market commentary for each symbol displayed in the scrolling ticker tape. Runs after each price check. Commentary is max 8 words per symbol, varied in phrasing, professional tone.

### 13. Countdown Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/countdown.ts`
- **Tools**: `queryPrices`, `queryPortfolio`
- **Purpose**: Generates contextual status messages for the news scan countdown timer. References specific portfolio details like number of symbols, households, notable movers, and sectors. Max 12 words.

### 14. Alert Actions Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/alert-actions.ts`
- **Tools**: `listAlerts`, `createAlert`, `deleteAlert`, `checkAlerts`, `queryPortfolio`, `queryPrices`, `sendEmail`
- **Purpose**: Handles alert dismissal from the alert detail view. Deletes alerts using the delete-alert tool and confirms the action.

### 15. Trade Analysis Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/trade-analysis.ts`
- **Tools**: `queryPortfolio`, `queryPrices`, `fetchCompanyProfile`
- **Purpose**: Provides specific, actionable trade recommendations when triggered from the alert detail view. Analyzes current position, fundamentals (PE ratio, 52-week range, sector), and delivers a trade recommendation with exact share count and target price.

### 16. News Lookup Agent
- **Model**: Claude Haiku on Bedrock
- **File**: `src/agents/news-lookup.ts`
- **Tools**: `fetchNews`, `queryPortfolio`, `queryPrices`, `fetchRedditSentiment`
- **Purpose**: On-demand news and market context agent triggered from the alert detail view. Fetches latest Google News headlines, current price action, Reddit sentiment, and provides watch factors for the advisor.

## Web UI

The dashboard is a scrollable single-page app with sticky topbar and ticker tape. Key sections:

- **AUM Summary** — Total assets under management across all households
- **US Markets** — S&P 500, Dow 30, Nasdaq index cards with sparkline charts
- **Alerts** — Clickable alert items with detail modal and agent-powered actions
- **Holdings** — Grouped by household with collapsible rows, sortable columns, and per-row action bar (Email, Analysis, Research, Sentiment, Rebalance, Report, Alert, Delete)
- **News** — Split positive/negative panels with AI-analyzed headlines
- **AI Chat** — Multi-agent chat with auto-routing by keyword (alerts, calendar, research, rebalance, report, sentiment)
- **Ticker Tape** — Scrolling market commentary generated by the Ticker Agent
- **Activity Log** — Real-time server log stream via SSE

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/logs` | SSE stream (prices, news, ticker, countdown, logs) |
| GET | `/api/symbols` | List watched symbols |
| POST | `/api/symbols` | Add a symbol |
| DELETE | `/api/symbols/:symbol` | Remove a symbol |
| GET/POST | `/api/interval` | Price polling interval |
| POST | `/api/price-refresh` | Trigger immediate price fetch |
| GET/POST | `/api/news-interval` | News polling interval |
| POST | `/api/news-refresh` | Trigger immediate news scan |
| GET | `/api/holdings` | List all holdings, households, people |
| POST | `/api/holdings` | Add a holding |
| DELETE | `/api/holdings/:id` | Remove a holding |
| GET | `/api/alerts` | List all alerts |
| DELETE | `/api/alerts/:id` | Delete an alert |
| POST | `/api/alerts/:id/toggle` | Enable/disable an alert |
| GET | `/api/reports` | List saved reports |
| DELETE | `/api/reports/:id` | Delete a report |
| GET | `/api/calendar` | List calendar events |
| POST | `/api/advisor` | Send prompt to Advisor Agent |
| POST | `/api/email` | Send prompt to Email Agent |
| POST | `/api/chat` | Send message to Chat or Calendar Agent |
| POST | `/api/agent/:name` | Generic agent endpoint (alerts, research, rebalance, reporting, sentiment, alert-actions) |
