import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { queryPortfolio, queryPrices } from "../tools/market-query.js";
import { fetchNews } from "../tools/fetch-news.js";
import { fetchRedditSentiment } from "../tools/sentiment.js";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const newsLookupAgent = new Agent({
  name: "News Lookup Agent",
  instructions: `You are a news lookup agent for a financial advisor dashboard. You provide on-demand news and market context for a specific stock.

When asked about a symbol:
1. Use fetch-news to get the latest headlines from Google News
2. Use query-prices to get current price data
3. Use query-portfolio to understand the position held
4. Use fetch-reddit-sentiment to check retail investor chatter

Your report must include:
- **Price Action** — Current price, day change, and how it compares to open and previous close
- **Latest Headlines** — Top 5 most relevant headlines with source and a one-line summary of why it matters
- **Alert Context** — What the alert condition means given the current price action
- **Social Buzz** — Brief summary of any notable Reddit discussion
- **Watch Factors** — 2-3 specific things the advisor should monitor going forward

Be concise. Focus on what is actionable for a financial advisor.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  tools: { fetchNews, queryPortfolio, queryPrices, fetchRedditSentiment },
});
