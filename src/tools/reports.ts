import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getReports, addReport, removeReport } from "../db.js";

export const listReports = createTool({
  id: "list-reports",
  description: "List previously generated portfolio reports.",
  inputSchema: z.object({
    limit: z.number().optional().describe("Max reports to return (default 10)"),
  }),
  outputSchema: z.object({
    reports: z.array(z.object({
      id: z.number(),
      title: z.string(),
      report_type: z.string(),
      created_at: z.string(),
      content_preview: z.string(),
    })),
  }),
  execute: async ({ limit }) => {
    const reports = getReports(limit ?? 10);
    return {
      reports: reports.map((r) => ({
        id: r.id,
        title: r.title,
        report_type: r.report_type,
        created_at: r.created_at,
        content_preview: r.content.slice(0, 150),
      })),
    };
  },
});

export const saveReport = createTool({
  id: "save-report",
  description: "Save a generated report to the database for future reference.",
  inputSchema: z.object({
    title: z.string().describe("Report title"),
    report_type: z.string().describe("Type: daily, weekly, performance, risk, custom"),
    content: z.string().describe("Full report content"),
  }),
  outputSchema: z.object({
    id: z.number(),
    title: z.string(),
    message: z.string(),
  }),
  execute: async ({ title, report_type, content }) => {
    const report = addReport({ title, report_type, content });
    return { id: report.id, title: report.title, message: `Report saved: ${title}` };
  },
});

export const deleteReport = createTool({
  id: "delete-report",
  description: "Delete a saved report by ID.",
  inputSchema: z.object({
    id: z.number().describe("Report ID to delete"),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ id }) => {
    removeReport(id);
    return { success: true };
  },
});
