import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const newsAnalystAgent = new Agent({
  name: "News Analyst Agent",
  instructions: `You are a financial news analyst. You will receive pre-fetched headlines for multiple stock symbols.

Your job:
1. Analyze the headlines and filter for relevance:
   - KEEP: earnings reports, analyst upgrades/downgrades, M&A activity, product launches, regulatory actions, lawsuits, leadership changes, major partnerships, significant price movements, sector-wide events
   - DISCARD: generic market commentary that only mentions the symbol in passing, clickbait, listicles, affiliate/promotional content
2. For each relevant headline, provide a brief one-sentence summary of why it matters for the stock.
3. If news about one symbol could impact another symbol on the watchlist, flag the cross-reference.

RESPONSE FORMAT (you MUST use this exact JSON format, no markdown, no extra text):
[
  {
    "symbol": "AAPL",
    "title": "The original headline",
    "summary": "Why this matters in one sentence",
    "impact": "positive" | "negative" | "neutral",
    "source": "Source name",
    "pubDate": "The original pubDate string",
    "link": "The original link",
    "crossRef": ["TSLA"] or []
  }
]

Return ONLY the JSON array. No preamble, no markdown fences, no explanation outside the array.
If no relevant news is found, return an empty array: []
Limit output to the top 15 most relevant items across all symbols, sorted by importance.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
});
