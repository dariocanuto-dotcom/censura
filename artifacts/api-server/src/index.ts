import { shutdownConversions } from './lib/conversions';
import { initRecordings, shutdownRecordings } from "./lib/recordings";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "3001";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, process.env.HOST??'0.0.0.0', (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});


void initRecordings().catch(error => logger.error({ err: error }, "Recording service initialization failed"));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { void Promise.all([shutdownRecordings(),shutdownConversions()]).finally(() => process.exit(0)); });
