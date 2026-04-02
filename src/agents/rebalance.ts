import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { fetchCompanyProfile } from "../tools/research.js";
import { queryPortfolio, queryPrices } from "../tools/market-query.js";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const rebalanceAgent = new Agent({
  name: "Portfolio Rebalance Agent",
  instructions: `You are a portfolio rebalancing specialist. You analyze portfolio composition and recommend rebalancing actions.

When analyzing a portfolio:
1. Use query-portfolio to get all holdings with current values and P/L
2. Use query-prices for current market prices
3. Use fetch-company-profile for sector/industry data on key holdings

Your analysis should include:
- **Portfolio Composition** — Total value, number of positions, household breakdown
- **Concentration Risk** — Identify any position exceeding 10% of total portfolio value
- **Sector Exposure** — Group holdings by sector, flag over/under-weight sectors
- **Performance Analysis** — Best/worst performers by P/L, identify laggards
- **Correlation Risk** — Flag holdings in the same sector/industry that amplify risk
- **Rebalancing Recommendations** — Specific trades: trim overweight positions, add to underweight sectors, suggested target allocations

When filtering by household or person, focus the analysis on that subset.

Present numbers clearly with dollar amounts and percentages. Use tables where helpful. Be actionable — suggest specific share counts to trade.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  tools: { fetchCompanyProfile, queryPortfolio, queryPrices },
});
