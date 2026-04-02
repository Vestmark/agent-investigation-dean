import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getWeather = createTool({
  id: "get-weather",
  description: "Get current weather for a city or location.",
  inputSchema: z.object({
    location: z.string().describe("City name or location (e.g. 'New York', 'London')"),
  }),
  outputSchema: z.object({
    location: z.string(),
    temperature_f: z.number(),
    temperature_c: z.number(),
    condition: z.string(),
    humidity: z.string(),
    wind: z.string(),
    feels_like_f: z.number(),
  }),
  execute: async ({ location }) => {
    const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "stock-monitor/1.0" },
    });
    if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    const current = (data.current_condition as Record<string, unknown>[])?.[0] ?? {};
    return {
      location,
      temperature_f: Number(current.temp_F ?? 0),
      temperature_c: Number(current.temp_C ?? 0),
      condition: String((current.weatherDesc as Record<string, unknown>[])?.[0]?.value ?? "Unknown"),
      humidity: `${current.humidity ?? 0}%`,
      wind: `${current.windspeedMiles ?? 0} mph ${current.winddir16Point ?? ""}`,
      feels_like_f: Number(current.FeelsLikeF ?? 0),
    };
  },
});
