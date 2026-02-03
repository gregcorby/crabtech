import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { FakeProvider } from "@managed-bot/infra";
import { PrismaClient } from "@prisma/client";
import { JobProcessor } from "./processor.js";
import { PrismaBotRepository } from "./repository.js";
import { enqueueJob } from "./worker.js";
import { JOB_QUEUE_NAME, type AnyJobData, type ProvisionJobData } from "./jobs.js";

const TEST_QUEUE_NAME = `${JOB_QUEUE_NAME}-integration-test`;

const redisHost = process.env.REDIS_HOST ?? "localhost";
const redisPort = Number(process.env.REDIS_PORT ?? 6379);

describe("Worker integration", () => {
  let redis: Redis;
  let prisma: PrismaClient;
  let provider: FakeProvider;
  let repo: PrismaBotRepository;
  let queue: Queue<AnyJobData>;
  let worker: Worker<AnyJobData>;
  let workerConnection: Redis;
  let redisAvailable = false;

  const createdBotIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    redis = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null, lazyConnect: true });
    try {
      await redis.connect();
      redisAvailable = true;
    } catch {
      redisAvailable = false;
    }

    prisma = new PrismaClient();
    provider = new FakeProvider();
    repo = new PrismaBotRepository(prisma);
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
    }
    if (queue) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    if (workerConnection) {
      workerConnection.disconnect();
    }

    // Clean up seeded data in correct order (respecting foreign keys)
    for (const botId of createdBotIds) {
      await prisma.botEvent.deleteMany({ where: { botId } });
      await prisma.botInstance.deleteMany({ where: { botId } });
      await prisma.bot.deleteMany({ where: { id: botId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    createdBotIds.length = 0;
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    if (redisAvailable) {
      redis.disconnect();
    }
    await prisma.$disconnect();
  });

  async function seedBot(botId: string, userId: string) {
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: `${userId}@test.local`, passwordHash: "not-a-real-hash" },
      update: {},
    });
    createdUserIds.push(userId);

    await prisma.bot.create({
      data: {
        id: botId,
        userId,
        name: `test-bot-${botId}`,
        status: "provisioning",
      },
    });
    createdBotIds.push(botId);
  }

  it("enqueues a PROVISION_BOT job, processes it, and updates the database", async ({ skip }) => {
    if (!redisAvailable) {
      skip();
      return;
    }

    const botId = `integ-bot-${Date.now()}`;
    const userId = `integ-user-${Date.now()}`;
    await seedBot(botId, userId);

    workerConnection = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null });
    const processor = new JobProcessor({ provider, repo });

    queue = new Queue<AnyJobData>(TEST_QUEUE_NAME, {
      connection: redis.duplicate(),
    });

    worker = new Worker<AnyJobData>(
      TEST_QUEUE_NAME,
      async (job) => {
        await processor.process(job.data);
      },
      { connection: workerConnection, concurrency: 1 },
    );

    const jobData: ProvisionJobData = {
      type: "PROVISION_BOT",
      botId,
      userId,
      region: "nyc3",
      size: "s-1vcpu-1gb",
    };

    await enqueueJob(queue, jobData);

    // Wait for job completion
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Job did not complete in time")), 15_000);
      worker.on("completed", () => {
        clearTimeout(timeout);
        resolve();
      });
      worker.on("failed", (_job, err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Assert bot status was updated to "running"
    const bot = await prisma.bot.findUniqueOrThrow({ where: { id: botId } });
    expect(bot.status).toBe("running");

    // Assert instance row was persisted
    const instance = await prisma.botInstance.findUnique({ where: { botId } });
    expect(instance).not.toBeNull();
    expect(instance!.provider).toBe("fake");
    expect(instance!.region).toBe("nyc3");
    expect(instance!.size).toBe("s-1vcpu-1gb");
    expect(instance!.providerInstanceId).toMatch(/^fake-instance-/);
    expect(instance!.providerVolumeId).toMatch(/^fake-volume-/);
    expect(instance!.ipAddress).toBeDefined();

    // Assert event was persisted
    const events = await prisma.botEvent.findMany({ where: { botId } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("status_changed");
    const payload = JSON.parse(events[0].payloadJson!);
    expect(payload).toEqual({
      from: "provisioning",
      to: "running",
      jobType: "PROVISION_BOT",
    });
  }, 20_000);
});
