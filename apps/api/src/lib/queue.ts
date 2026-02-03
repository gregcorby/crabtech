import { Queue } from "bullmq";
import Redis from "ioredis";
import {
  JOB_QUEUE_NAME,
  RETRY_CONFIG,
  type AnyJobData,
} from "@managed-bot/worker";

const redisHost = process.env.REDIS_HOST ?? "localhost";
const redisPort = Number(process.env.REDIS_PORT ?? 6379);

const connection = new Redis({
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: null,
});

export const jobQueue = new Queue<AnyJobData>(JOB_QUEUE_NAME, { connection });

export async function enqueueJob(jobData: AnyJobData): Promise<void> {
  const retryConfig = RETRY_CONFIG[jobData.type];
  await jobQueue.add(jobData.type, jobData, {
    attempts: retryConfig?.maxAttempts ?? 3,
    backoff: {
      type: "exponential",
      delay: retryConfig?.backoffMs ?? 5000,
    },
  });
}
