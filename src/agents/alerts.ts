import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { listAlerts, createAlert, deleteAlert, checkAlerts } from "../tools/alerts.js";
import { queryPortfolio, queryPrices } from "../tools/market-query.js";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const alertsAgent = new Agent({
  name: "Alerts Agent",
  instructions: `You are a stock alerts management agent. You help users create, manage, and check price/portfolio alerts.

Available alert types:
- price_above: triggers when price rises above threshold (dollars)
- price_below: triggers when price falls below threshold (dollars)
- pl_above: triggers when P/L exceeds threshold (dollars)
- pl_below: triggers when P/L drops below threshold (dollars)
- daily_change_above: triggers when daily % change exceeds threshold (percent)
- daily_change_below: triggers when daily % change drops below threshold (percent)

When asked to set alerts:
1. Confirm the symbol, type, and threshold
2. Use create-alert tool to create it
3. Confirm what was created

When asked to check alerts:
1. Use check-alerts to evaluate all enabled alerts against current prices
2. Report any triggered alerts clearly

When asked to manage alerts:
- Use list-alerts to show current configuration
- Use delete-alert to remove alerts
- Always confirm actions

Use query-prices and query-portfolio for context when users ask about appropriate thresholds.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  tools: { listAlerts, createAlert, deleteAlert, checkAlerts, queryPortfolio, queryPrices },
});
