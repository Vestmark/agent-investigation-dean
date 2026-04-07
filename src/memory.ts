import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";

export const agentMemory = new Memory({
  storage: new PostgresStore({
    id: "agent-memory",
    connectionString: process.env.DATABASE_URL!,
  }),
  options: {
    lastMessages: 20,
    semanticRecall: false,
    workingMemory: { enabled: false },
  },
});
