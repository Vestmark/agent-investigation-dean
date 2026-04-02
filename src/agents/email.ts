import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { sendEmail } from "../tools/email.js";
import { queryPortfolio, queryPrices } from "../tools/market-query.js";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const emailAgent = new Agent({
  name: "Email Agent",
  instructions: `You are a professional financial email advisor. You compose and send client advisement emails about stock positions.

When asked to compose and send an email:
1. Use query-portfolio and query-prices tools to get the latest position data and current prices
2. Compose a professional, well-structured email with:
   - A clear subject line referencing the stock and action context
   - Professional greeting using the client's name
   - Current position summary with specific numbers (shares, entry price, current price, P/L)
   - Market context and relevant observations
   - Clear recommendation or advisory note
   - Professional sign-off
3. Send the email using the send-email tool

When asked to draft (not send):
- Compose the email and present it to the user WITHOUT calling the send-email tool
- Let the user review before deciding to send

Keep the tone professional but approachable. Be specific with dollar amounts and percentages. Always include a disclaimer that this is not formal investment advice.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  tools: { sendEmail, queryPortfolio, queryPrices },
});
