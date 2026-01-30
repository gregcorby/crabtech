import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { FakeProvider, DigitalOceanProvider } from "@managed-bot/infra";
import { createLogger } from "@managed-bot/shared";
import { JobProcessor } from "./processor.js";
import { PrismaBotRepository } from "./repository.js";
import { prisma } from "./db.js";
import { JOB_QUEUE_NAME, RETRY_CONFIG, type AnyJobData } from "./jobs.js";

const logger = createLogger("Worker");

const redisHost = process.env.REDIS_HOST ?? "localhost";
const redisPort = Number(process.env.REDIS_PORT ?? 6379);

function createRedisConnection(): Redis {
  return new Redis({
    host: redisHost,
    port: redisPort,
    maxRetriesPerRequest: null,
  });
}

function createProvider() {
  const providerName = process.env.PROVIDER ?? "fake";
  switch (providerName) {
    case "fake":
      return new FakeProvider();
    case "digitalocean": {
      const apiToken = process.env.DIGITALOCEAN_API_TOKEN;
      if (!apiToken) {
        throw new Error("DIGITALOCEAN_API_TOKEN env var is required when PROVIDER=digitalocean");
      }
      return new DigitalOceanProvider(apiToken);
    }
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

export async function enqueueJob(
  queue: Queue<AnyJobData>,
  jobData: AnyJobData,
): Promise<void> {
  const retryConfig = RETRY_CONFIG[jobData.type];
  await queue.add(jobData.type, jobData, {
    attempts: retryConfig?.maxAttempts ?? 3,
    backoff: {
      type: "exponential",
      delay: retryConfig?.backoffMs ?? 5000,
    },
  });
  logger.info(`Enqueued job ${jobData.type} for bot ${jobData.botId}`);
}

export function startWorker(): {
  worker: Worker<AnyJobData>;
  queue: Queue<AnyJobData>;
  shutdown: () => Promise<void>;
} {
  const connection = createRedisConnection();
  const provider = createProvider();
  const repo = new PrismaBotRepository(prisma);
  const processor = new JobProcessor({ provider, repo, logger });

  const queue = new Queue<AnyJobData>(JOB_QUEUE_NAME, { connection: connection.duplicate() });

  const worker = new Worker<AnyJobData>(
    JOB_QUEUE_NAME,
    async (job) => {
      logger.info(`Received job ${job.name} (id=${job.id}) attempt ${job.attemptsMade + 1}`);
      await processor.process(job.data);
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    logger.info(`Job ${job?.name} (id=${job?.id}) completed`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Job ${job?.name} (id=${job?.id}) failed: ${err.message}`);
  });

  worker.on("error", (err) => {
    logger.error(`Worker error: ${err.message}`);
  });

  const shutdown = async () => {
    logger.info("Shutting down worker...");
    await worker.close();
    await queue.close();
    connection.disconnect();
    await prisma.$disconnect();
    logger.info("Worker shut down");
  };

  logger.info(`Worker started, listening on queue "${JOB_QUEUE_NAME}"`);
  return { worker, queue, shutdown };
}

// Run as standalone process
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const { shutdown } = startWorker();

  const onSignal = async () => {
    await shutdown();
    process.exit(0);
  };

  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
}
