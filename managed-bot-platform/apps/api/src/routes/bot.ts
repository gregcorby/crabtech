import type { FastifyInstance } from "fastify";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  createBotSchema,
  updateBotConfigSchema,
  encrypt,
} from "@managed-bot/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, getUser } from "../lib/auth.js";
import { zodBody } from "../lib/schema.js";
import { enqueueJob } from "../lib/queue.js";

const RESTART_COOLDOWN_MS = 60_000; // 1 minute between restarts

export async function botRoutes(app: FastifyInstance) {
  // All bot routes require authentication
  app.addHook("preHandler", requireAuth);

  app.post("/create", { schema: zodBody(createBotSchema) }, async (request) => {
    const { userId } = getUser(request);
    const parsed = createBotSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0].message);
    }

    // Check subscription status
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription || subscription.status !== "active") {
      throw new ForbiddenError("Active subscription required to create a bot");
    }

    // Enforce one bot per user
    const existingBot = await prisma.bot.findUnique({ where: { userId } });
    if (existingBot && existingBot.status !== "destroyed") {
      throw new ConflictError("You already have an active bot");
    }

    const bot = await prisma.bot.create({
      data: {
        userId,
        name: parsed.data.name,
        status: "provisioning",
      },
    });

    await prisma.botEvent.create({
      data: {
        botId: bot.id,
        type: "bot_created",
        payloadJson: JSON.stringify({ name: bot.name }),
      },
    });

    await enqueueJob({
      type: "PROVISION_BOT",
      botId: bot.id,
      userId,
      region: "nyc1",
      size: "s-1vcpu-1gb",
    });

    return {
      bot: {
        id: bot.id,
        name: bot.name,
        status: bot.status,
        createdAt: bot.createdAt.toISOString(),
        updatedAt: bot.updatedAt.toISOString(),
      },
    };
  });

  app.get("/status", async (request) => {
    const { userId } = getUser(request);
    const bot = await prisma.bot.findUnique({ where: { userId } });
    if (!bot) {
      throw new NotFoundError("No bot found");
    }

    const secrets = await prisma.botSecret.findMany({
      where: { botId: bot.id },
      select: { key: true },
    });

    return {
      bot: {
        id: bot.id,
        name: bot.name,
        status: bot.status,
        createdAt: bot.createdAt.toISOString(),
        updatedAt: bot.updatedAt.toISOString(),
      },
      secrets: secrets.map((s) => ({ key: s.key, present: true })),
    };
  });

  app.post("/stop", async (request) => {
    const { userId } = getUser(request);
    const bot = await prisma.bot.findUnique({
      where: { userId },
      include: { instance: true },
    });
    if (!bot) {
      throw new NotFoundError("No bot found");
    }
    if (bot.status !== "running") {
      throw new BadRequestError("Bot is not running");
    }

    await prisma.bot.update({
      where: { id: bot.id },
      data: { status: "stopped" },
    });

    if (bot.instance) {
      await enqueueJob({
        type: "STOP_BOT",
        botId: bot.id,
        userId,
        instanceId: bot.instance.id,
      });
    }

    await prisma.botEvent.create({
      data: {
        botId: bot.id,
        type: "bot_stop_requested",
      },
    });

    return { ok: true };
  });

  app.post("/restart", async (request) => {
    const { userId } = getUser(request);
    const bot = await prisma.bot.findUnique({
      where: { userId },
      include: { instance: true },
    });
    if (!bot) {
      throw new NotFoundError("No bot found");
    }
    if (!["stopped", "running", "error"].includes(bot.status)) {
      throw new BadRequestError(`Cannot restart bot in status: ${bot.status}`);
    }

    // Restart throttling: check last restart event
    const lastRestart = await prisma.botEvent.findFirst({
      where: { botId: bot.id, type: "bot_restart_requested" },
      orderBy: { createdAt: "desc" },
    });
    if (lastRestart && Date.now() - lastRestart.createdAt.getTime() < RESTART_COOLDOWN_MS) {
      throw new BadRequestError("Restart throttled. Please wait before restarting again.");
    }

    if (bot.instance) {
      await enqueueJob({
        type: "RESTART_BOT",
        botId: bot.id,
        userId,
        instanceId: bot.instance.id,
      });
    }

    await prisma.botEvent.create({
      data: {
        botId: bot.id,
        type: "bot_restart_requested",
      },
    });

    return { ok: true };
  });

  app.post("/config", { schema: zodBody(updateBotConfigSchema) }, async (request) => {
    const { userId } = getUser(request);
    const parsed = updateBotConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0].message);
    }

    const bot = await prisma.bot.findUnique({ where: { userId } });
    if (!bot) {
      throw new NotFoundError("No bot found");
    }

    const { modelProvider, apiKey, systemInstructions } = parsed.data;

    if (apiKey) {
      const encrypted = encrypt(apiKey);
      await prisma.botSecret.upsert({
        where: { botId_key: { botId: bot.id, key: "api_key" } },
        update: { valueEncrypted: encrypted },
        create: { botId: bot.id, key: "api_key", valueEncrypted: encrypted },
      });
    }

    if (modelProvider) {
      await prisma.botSecret.upsert({
        where: { botId_key: { botId: bot.id, key: "model_provider" } },
        update: { valueEncrypted: encrypt(modelProvider) },
        create: { botId: bot.id, key: "model_provider", valueEncrypted: encrypt(modelProvider) },
      });
    }

    if (systemInstructions) {
      await prisma.botSecret.upsert({
        where: { botId_key: { botId: bot.id, key: "system_instructions" } },
        update: { valueEncrypted: encrypt(systemInstructions) },
        create: { botId: bot.id, key: "system_instructions", valueEncrypted: encrypt(systemInstructions) },
      });
    }

    await prisma.botEvent.create({
      data: {
        botId: bot.id,
        type: "config_updated",
        payloadJson: JSON.stringify({
          modelProvider: modelProvider ? "updated" : undefined,
          apiKey: apiKey ? "updated" : undefined,
          systemInstructions: systemInstructions ? "updated" : undefined,
        }),
      },
    });

    return { ok: true };
  });

  app.get("/events", async (request) => {
    const { userId } = getUser(request);
    const bot = await prisma.bot.findUnique({ where: { userId } });
    if (!bot) {
      throw new NotFoundError("No bot found");
    }

    const events = await prisma.botEvent.findMany({
      where: { botId: bot.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return {
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        payloadJson: e.payloadJson,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
}
