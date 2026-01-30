import type { ComputeProvider } from "@managed-bot/infra";
import { createLogger, type Logger, ProviderError, RetryableProviderError } from "@managed-bot/shared";
import type { AnyJobData, ProvisionJobData, DestroyJobData } from "./jobs.js";
import { getTargetStatus, getErrorStatus, canTransition } from "./state-machine.js";
import type { BotStatus } from "@managed-bot/shared";

export interface BotRepository {
  getBotStatus(botId: string): Promise<BotStatus | null>;
  updateBotStatus(botId: string, status: BotStatus): Promise<void>;
  saveBotInstance(botId: string, data: {
    provider: string;
    providerInstanceId: string;
    providerVolumeId: string | null;
    region: string;
    size: string;
    ipAddress: string | null;
  }): Promise<void>;
  deleteBotInstance(botId: string): Promise<void>;
  addBotEvent(botId: string, type: string, payload?: Record<string, unknown>): Promise<void>;
}

export interface ProcessorDeps {
  provider: ComputeProvider;
  repo: BotRepository;
  logger?: Logger;
}

export class JobProcessor {
  private provider: ComputeProvider;
  private repo: BotRepository;
  private logger: Logger;

  constructor(deps: ProcessorDeps) {
    this.provider = deps.provider;
    this.repo = deps.repo;
    this.logger = deps.logger ?? createLogger("JobProcessor");
  }

  async process(job: AnyJobData): Promise<void> {
    const { botId, type } = job;
    this.logger.info(`Processing job ${type} for bot ${botId}`);

    const currentStatus = await this.repo.getBotStatus(botId);
    if (!currentStatus) {
      this.logger.error(`Bot ${botId} not found, skipping job`);
      return;
    }

    if (!canTransition(currentStatus, type)) {
      this.logger.warn(`Cannot transition bot ${botId} from ${currentStatus} for job ${type}`);
      return;
    }

    try {
      await this.executeJob(job);
      const targetStatus = getTargetStatus(type);
      if (targetStatus) {
        await this.repo.updateBotStatus(botId, targetStatus);
        await this.repo.addBotEvent(botId, `status_changed`, { from: currentStatus, to: targetStatus, jobType: type });
      }
      this.logger.info(`Job ${type} completed for bot ${botId}`);
    } catch (err) {
      if (err instanceof RetryableProviderError) {
        this.logger.warn(`Retryable error for bot ${botId}: ${err.message}`);
        throw err; // BullMQ will retry
      }

      const errorStatus = getErrorStatus(type);
      await this.repo.updateBotStatus(botId, errorStatus);
      await this.repo.addBotEvent(botId, "job_failed", {
        jobType: type,
        error: err instanceof Error ? err.message : String(err),
      });
      this.logger.error(`Job ${type} failed for bot ${botId}`, {
        error: err instanceof Error ? err.message : String(err),
      });

      if (err instanceof ProviderError && !err.retryable) {
        return; // Fatal: don't rethrow
      }
      throw err;
    }
  }

  private async executeJob(job: AnyJobData): Promise<void> {
    switch (job.type) {
      case "PROVISION_BOT":
        return this.handleProvision(job);
      case "STOP_BOT":
      case "SUSPEND_BOT":
        return this.handleStop(job);
      case "RESTART_BOT":
      case "RESUME_BOT":
        return this.handleRestart(job);
      case "DESTROY_BOT":
      case "DESTROY_BOT_SUBSCRIPTION_ENDED":
        return this.handleDestroy(job as DestroyJobData);
      case "HEALTH_POLL":
        return this.handleHealthPoll(job);
      default:
        this.logger.error(`Unknown job type: ${(job as AnyJobData).type}`);
    }
  }

  private async handleProvision(job: ProvisionJobData): Promise<void> {
    const resources = await this.provider.createInstance({
      botId: job.botId,
      region: job.region,
      size: job.size,
      userData: "",
      tags: [`bot:${job.botId}`, `user:${job.userId}`],
    });

    await this.repo.saveBotInstance(job.botId, {
      provider: this.provider.name,
      providerInstanceId: resources.instanceId,
      providerVolumeId: resources.volumeId,
      region: job.region,
      size: job.size,
      ipAddress: resources.ipAddress,
    });
  }

  private async handleStop(job: AnyJobData & { instanceId: string }): Promise<void> {
    await this.provider.destroyInstance(job.instanceId);
  }

  private async handleRestart(job: AnyJobData & { instanceId: string }): Promise<void> {
    const status = await this.provider.getInstanceStatus(job.instanceId);
    if (status === "active") {
      await this.provider.destroyInstance(job.instanceId);
    }
    await this.provider.createInstance({
      botId: job.botId,
      region: "nyc3",
      size: "s-1vcpu-1gb",
      userData: "",
      tags: [`bot:${job.botId}`, `user:${job.userId}`],
    });
  }

  private async handleDestroy(job: DestroyJobData): Promise<void> {
    await this.provider.destroyInstance(job.instanceId);
    if (job.volumeId) {
      await this.provider.destroyVolume(job.volumeId);
    }
    await this.repo.deleteBotInstance(job.botId);
  }

  private async handleHealthPoll(job: AnyJobData & { instanceId: string }): Promise<void> {
    const status = await this.provider.getInstanceStatus(job.instanceId);
    if (status !== "active") {
      this.logger.warn(`Bot ${job.botId} instance ${job.instanceId} is ${status}`);
      await this.repo.addBotEvent(job.botId, "health_check_failed", { instanceStatus: status });
    }
  }
}
