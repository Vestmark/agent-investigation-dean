import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getAllAlerts, getEnabledAlerts, addAlert, removeAlert, toggleAlert, updateAlertTriggered } from "../db.js";
import { updatePriceMap } from "./market-query.js";

// Shared price reference (set by index.ts)
let alertPriceMap: Record<string, number> = {};
export function updateAlertPriceMap(map: Record<string, number>): void {
  alertPriceMap = { ...map };
}

export const listAlerts = createTool({
  id: "list-alerts",
  description: "List all configured price/portfolio alerts.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    alerts: z.array(z.object({
      id: z.number(),
      symbol: z.string(),
      alert_type: z.string(),
      threshold: z.number(),
      person_name: z.string(),
      household: z.string(),
      enabled: z.number(),
      last_triggered: z.string().nullable(),
    })),
  }),
  execute: async () => {
    return { alerts: getAllAlerts() };
  },
});

export const createAlert = createTool({
  id: "create-alert",
  description: "Create a new alert. Types: price_above, price_below, pl_above, pl_below, daily_change_above, daily_change_below. Threshold is the trigger value (dollar amount for price/pl, percentage for daily_change).",
  inputSchema: z.object({
    symbol: z.string().describe("Stock symbol to watch"),
    alert_type: z.enum(["price_above", "price_below", "pl_above", "pl_below", "daily_change_above", "daily_change_below"]),
    threshold: z.number().describe("Trigger value: price in dollars, P/L in dollars, or change in percent"),
    person_name: z.string().optional().describe("Person name (for P/L alerts)"),
    household: z.string().optional().describe("Household name (for P/L alerts)"),
  }),
  outputSchema: z.object({
    alert: z.object({
      id: z.number(),
      symbol: z.string(),
      alert_type: z.string(),
      threshold: z.number(),
    }),
    message: z.string(),
  }),
  execute: async ({ symbol, alert_type, threshold, person_name, household }) => {
    const alert = addAlert({
      symbol: symbol.toUpperCase(),
      alert_type,
      threshold,
      person_name: person_name ?? "",
      household: household ?? "",
      enabled: 1,
    });
    return {
      alert: { id: alert.id, symbol: alert.symbol, alert_type: alert.alert_type, threshold: alert.threshold },
      message: `Alert created: ${alert_type} ${threshold} for ${symbol.toUpperCase()}`,
    };
  },
});

export const deleteAlert = createTool({
  id: "delete-alert",
  description: "Delete an alert by its ID.",
  inputSchema: z.object({
    id: z.number().describe("Alert ID to delete"),
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  execute: async ({ id }) => {
    removeAlert(id);
    return { success: true, message: `Alert ${id} deleted.` };
  },
});

export const checkAlerts = createTool({
  id: "check-alerts",
  description: "Check all enabled alerts against current prices and return any that are triggered.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    triggered: z.array(z.object({
      id: z.number(),
      symbol: z.string(),
      alert_type: z.string(),
      threshold: z.number(),
      current_value: z.number(),
      message: z.string(),
    })),
    checked: z.number(),
  }),
  execute: async () => {
    const alerts = getEnabledAlerts();
    const triggered: { id: number; symbol: string; alert_type: string; threshold: number; current_value: number; message: string }[] = [];

    for (const a of alerts) {
      const price = alertPriceMap[a.symbol];
      if (!price) continue;

      let fire = false;
      let currentValue = price;
      let msg = "";

      switch (a.alert_type) {
        case "price_above":
          fire = price >= a.threshold;
          msg = `${a.symbol} price $${price.toFixed(2)} >= $${a.threshold.toFixed(2)}`;
          break;
        case "price_below":
          fire = price <= a.threshold;
          msg = `${a.symbol} price $${price.toFixed(2)} <= $${a.threshold.toFixed(2)}`;
          break;
      }

      if (fire) {
        updateAlertTriggered(a.id);
        triggered.push({ id: a.id, symbol: a.symbol, alert_type: a.alert_type, threshold: a.threshold, current_value: currentValue, message: msg });
      }
    }

    return { triggered, checked: alerts.length };
  },
});
