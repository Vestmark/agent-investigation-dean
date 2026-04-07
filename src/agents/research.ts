import { Agent } from "@mastra/core/agent";
import { bedrockProvider } from "../bedrock.js";
import { agentMemory } from "../memory.js";
import { fetchCompanyProfile, fetchSECFilings } from "../tools/research.js";
import { queryPortfolio, queryPrices } from "../tools/market-query.js";
import { fetchRedditSentiment } from "../tools/sentiment.js";

export const researchAgent = new Agent({
  name: "Research Agent",
  instructions: `You are a deep stock research analyst. When asked to research a stock, provide a comprehensive analysis.

Your research should cover:
1. **Company Profile** — Use fetch-company-profile to get sector, industry, market cap, PE ratio, 52-week range
2. **Current Position** — Use query-portfolio to see if the user holds this stock, positions, and P/L
3. **SEC Filings** — Use fetch-sec-filings to check recent regulatory filings (10-K, 10-Q, 8-K)
4. **Social Sentiment** — Use fetch-reddit-sentiment to gauge retail investor sentiment
5. **Valuation Assessment** — Based on PE, forward PE, sector comparisons
6. **Risk Factors** — Concentration risk if heavily held, sector risk, volatility

Structure your output as a clear research report with sections. Include specific numbers. End with a summary rating: Strong Buy, Buy, Hold, Sell, or Strong Sell with rationale.

Be thorough but concise. Use bullet points within sections.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  tools: { fetchCompanyProfile, fetchSECFilings, queryPortfolio, queryPrices, fetchRedditSentiment },
  memory: agentMemory,
});
