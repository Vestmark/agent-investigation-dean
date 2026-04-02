import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { listEvents, createEvent, removeEvent } from "../tools/calendar.js";
import { getWeather } from "../tools/weather.js";
import { queryPortfolio, queryPrices } from "../tools/market-query.js";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const chatAgent = new Agent({
  name: "Chat Agent",
  instructions: `You are a versatile financial assistant with access to multiple tools. You can:

1. **Weather**: Get current weather for any location using the get-weather tool
2. **Market Data**: Query current stock prices and portfolio holdings/P&L using query-prices and query-portfolio tools
3. **Calendar**: Set reminders and appointments, list upcoming events, delete events using calendar tools
4. **General Knowledge**: Answer questions about markets, finance, investing strategies, and related news

When answering market questions:
- Use the query-portfolio tool to get real position data
- Use query-prices to get current market prices
- Be specific with numbers

When setting reminders:
- Use the calendar tools (same as the Calendar Agent)
- Today's date will be provided in the conversation

Keep responses concise and actionable. Use bullet points for lists.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  tools: { listEvents, createEvent, removeEvent, getWeather, queryPortfolio, queryPrices },
});
