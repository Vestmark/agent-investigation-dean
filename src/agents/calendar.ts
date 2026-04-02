import { Agent } from "@mastra/core/agent";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { listEvents, createEvent, removeEvent } from "../tools/calendar.js";

const bedrockProvider = createAmazonBedrock({
  region: process.env.AWS_REGION || "us-east-1",
  credentialProvider: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const calendarAgent = new Agent({
  name: "Calendar Agent",
  instructions: `You are a helpful calendar and reminders assistant. You help the user manage their schedule.

You have tools to:
- List all calendar events and reminders
- Create new events, appointments, and reminders
- Delete events by ID

When the user asks to set a reminder or appointment:
1. Extract the title, date (YYYY-MM-DD), and optional time (HH:MM 24h format)
2. If the date is relative (e.g. "tomorrow", "next Tuesday"), calculate the actual date. Today's date will be provided in the conversation.
3. Create the event using the tool
4. Confirm what was created

When listing events, present them in a clean readable format.
When deleting, confirm the deletion.

Always be concise and helpful.`,
  model: bedrockProvider("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
  tools: { listEvents, createEvent, removeEvent },
});
