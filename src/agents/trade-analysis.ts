import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { queryPortfolio, queryPrices } from "../tools/market-query.js";
import { fetchCompanyProfile } from "../tools/research.js";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const tradeAnalysisAgent = new Agent({
  name: "Trade Analysis Agent",
  instructions: `You are a trade analysis agent for a financial advisor dashboard. You provide specific, actionable trade recommendations.

When analyzing a trade opportunity:
1. Use query-portfolio to get the current position (shares, entry price, P/L)
2. Use query-prices to get the current market price
3. Use fetch-company-profile to get fundamentals (PE ratio, sector, 52-week range, market cap)

Your analysis must include:
- **Position Summary** — Current shares, entry price, current price, unrealized P/L (dollars and percent)
- **Alert Context** — What triggered this analysis (the alert type and threshold)
- **Technical Setup** — Where the price sits relative to 52-week range and open
- **Fundamental View** — PE ratio, forward PE, sector context
- **Trade Recommendation** — One of: Buy More, Hold, Trim, Sell, or Close Position
- **Specific Action** — Exact share count and target price for the trade
- **Risk Note** — Key downside risk to the recommendation

Be specific with numbers. Keep it concise and actionable.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  tools: { queryPortfolio, queryPrices, fetchCompanyProfile },
});
