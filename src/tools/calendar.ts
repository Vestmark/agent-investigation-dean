import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getCalendarEvents, addCalendarEvent, deleteCalendarEvent } from "../db.js";

export const listEvents = createTool({
  id: "list-calendar-events",
  description: "List all calendar events, reminders, and appointments.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    events: z.array(z.object({
      id: z.number(),
      title: z.string(),
      description: z.string(),
      event_date: z.string(),
      event_time: z.string(),
      reminder: z.number(),
      created_at: z.string(),
    })),
  }),
  execute: async () => {
    return { events: getCalendarEvents() };
  },
});

export const createEvent = createTool({
  id: "create-calendar-event",
  description: "Create a new calendar event, reminder, or appointment. Use YYYY-MM-DD for date and HH:MM for time (24h format).",
  inputSchema: z.object({
    title: z.string().describe("Title of the event or reminder"),
    description: z.string().optional().describe("Optional details"),
    event_date: z.string().describe("Date in YYYY-MM-DD format"),
    event_time: z.string().optional().describe("Time in HH:MM format (24h), empty for all-day"),
    reminder: z.boolean().optional().describe("Whether this is a reminder (true) or appointment (false)"),
  }),
  outputSchema: z.object({
    event: z.object({
      id: z.number(),
      title: z.string(),
      description: z.string(),
      event_date: z.string(),
      event_time: z.string(),
      reminder: z.number(),
      created_at: z.string(),
    }),
    message: z.string(),
  }),
  execute: async ({ title, description, event_date, event_time, reminder }) => {
    const event = addCalendarEvent({
      title,
      description: description ?? "",
      event_date,
      event_time: event_time ?? "",
      reminder: reminder ? 1 : 0,
    });
    return { event, message: `Created: "${title}" on ${event_date}${event_time ? " at " + event_time : ""}` };
  },
});

export const removeEvent = createTool({
  id: "delete-calendar-event",
  description: "Delete a calendar event by its ID.",
  inputSchema: z.object({
    id: z.number().describe("The event ID to delete"),
  }),
  outputSchema: z.object({ message: z.string() }),
  execute: async ({ id }) => {
    deleteCalendarEvent(id);
    return { message: `Event ${id} deleted.` };
  },
});
