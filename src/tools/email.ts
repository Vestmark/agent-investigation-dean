import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: fromNodeProviderChain({
    profile: process.env.AWS_PROFILE,
  }),
});

export const sendEmail = createTool({
  id: "send-email",
  description: "Send an email via AWS SES. Use this to send advisement emails to clients.",
  inputSchema: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body in plain text"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ to, subject, body }) => {
    const fromAddress = process.env.SES_FROM_EMAIL || "advisor@example.com";
    try {
      const result = await ses.send(
        new SendEmailCommand({
          Source: fromAddress,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: body, Charset: "UTF-8" } },
          },
        })
      );
      return {
        success: true,
        messageId: result.MessageId ?? "unknown",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  },
});
