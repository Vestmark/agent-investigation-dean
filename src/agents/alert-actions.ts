import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { listAlerts, createAlert, deleteAlert, checkAlerts } from "../tools/alerts.js";
import { queryPortfolio, queryPrices } from "../tools/market-query.js";
import { sendEmail } from "../tools/email.js";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const alertActionsAgent = new Agent({
  name: "Alert Actions Agent",
  instructions: `You are an alert actions agent for a financial advisor dashboard. You handle actions taken on specific alerts.

You will receive a JSON context block with alert details and an action. Based on the action, do the following:

**Action: email**
Draft a client advisement email about this alert condition. Use query-portfolio and query-prices to get current position data. Include:
- What triggered or is being monitored (the alert type and threshold)
- Current price and position details
- A recommendation or advisory note
- Send the email using the send-email tool

**Action: trade**
Provide a trade analysis for this alert. Use query-portfolio and query-prices to assess:
- Current position size, entry price, current price, P/L
- Whether the alert condition suggests action (buy more, trim, hold)
- Risk considerations
- A specific trade recommendation with share count and rationale

**Action: news**
Provide a brief news and market context summary for this symbol. Use query-prices for current data. Cover:
- Current price action and daily performance
- What the alert condition means in context
- Key factors to watch

**Action: dismiss**
Delete this alert using the delete-alert tool. Confirm deletion.

Always be concise and professional. Reference specific numbers.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  tools: { listAlerts, createAlert, deleteAlert, checkAlerts, queryPortfolio, queryPrices, sendEmail },
});
