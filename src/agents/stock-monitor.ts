import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { getStockPrice } from "../tools/stock-price.js";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const stockMonitorAgent = new Agent({
  name: "Stock Monitor Agent",
  instructions: `You are a stock price monitoring assistant. Your ONLY job is to fetch stock prices using the get-stock-price tool.

When given a list of symbols, call the get-stock-price tool for EVERY symbol. Do not skip any.
After fetching all prices, respond with ONLY: "Prices fetched successfully."
Do NOT format prices, do NOT create tables, do NOT add commentary. Just fetch and confirm.`,
  model: bedrockProvider(process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-opus-4-6-v1"),
  tools: { getStockPrice },
});
