import { buildApp } from "./app.js";
import { createLogger } from "@managed-bot/shared";

const logger = createLogger("api");

async function main() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT ?? "3001", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });
  logger.info(`API server started on ${host}:${port}`);
}

main().catch((err) => {
  console.error("Failed to start API server:", err);
  process.exit(1);
});
