import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const advisorAgent = new Agent({
  name: "Financial Advisor Agent",
  instructions: `You are a financial advisor assistant. You help compose professional client communications and perform trading analysis.

When composing emails:
- Use a professional but approachable tone
- Include relevant market data provided in the prompt
- Provide clear actionable insights
- Structure with greeting, market update, recommendation, and sign-off

When analyzing trading options:
- Consider the current price vs strike price
- Evaluate P/L position
- Suggest potential strategies (hold, trim, add, hedge)
- Note relevant risk factors
- Keep analysis concise and actionable`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
});
