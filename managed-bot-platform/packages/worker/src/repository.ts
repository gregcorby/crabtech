import type { PrismaClient } from "@prisma/client";
import type { BotStatus, CloudProvider } from "@managed-bot/shared";
import type { BotRepository } from "./processor.js";

export class PrismaBotRepository implements BotRepository {
  constructor(private prisma: PrismaClient) {}

  async getBotStatus(botId: string): Promise<BotStatus | null> {
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { status: true },
    });
    return (bot?.status as BotStatus) ?? null;
  }

  async updateBotStatus(botId: string, status: BotStatus): Promise<void> {
    await this.prisma.bot.update({
      where: { id: botId },
      data: { status: status as any },
    });
  }

  async saveBotInstance(
    botId: string,
    data: {
      provider: string;
      providerInstanceId: string;
      providerVolumeId: string | null;
      region: string;
      size: string;
      ipAddress: string | null;
    },
  ): Promise<void> {
    await this.prisma.botInstance.upsert({
      where: { botId },
      create: {
        botId,
        provider: data.provider as CloudProvider,
        providerInstanceId: data.providerInstanceId,
        providerVolumeId: data.providerVolumeId,
        region: data.region,
        size: data.size,
        ipAddress: data.ipAddress,
      },
      update: {
        provider: data.provider as CloudProvider,
        providerInstanceId: data.providerInstanceId,
        providerVolumeId: data.providerVolumeId,
        region: data.region,
        size: data.size,
        ipAddress: data.ipAddress,
      },
    });
  }

  async deleteBotInstance(botId: string): Promise<void> {
    await this.prisma.botInstance.deleteMany({
      where: { botId },
    });
  }

  async addBotEvent(
    botId: string,
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.botEvent.create({
      data: {
        botId,
        type,
        payloadJson: payload ? JSON.stringify(payload) : null,
      },
    });
  }
}
