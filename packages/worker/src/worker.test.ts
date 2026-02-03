import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeProvider } from "@managed-bot/infra";
import type { BotStatus } from "@managed-bot/shared";
import { ProviderError, RetryableProviderError, encrypt } from "@managed-bot/shared";
import { renderCloudInit } from "@managed-bot/runtime";
import { JobProcessor, HEALTH_POLL_INTERVAL_MS } from "./processor.js";
import type { BotRepository } from "./processor.js";
import type { AnyJobData, ProvisionJobData, StopJobData, DestroyJobData, RestartJobData, ResumeJobData, HealthPollJobData } from "./jobs.js";

const TEST_MASTER_KEY = "test-master-key-at-least-32-chars-long!!";

class InMemoryBotRepository implements BotRepository {
  private statuses = new Map<string, BotStatus>();
  private instances = new Map<string, {
    provider: string;
    providerInstanceId: string;
    providerVolumeId: string | null;
    region: string;
    size: string;
    ipAddress: string | null;
  }>();
  private events: Array<{ botId: string; type: string; payload?: Record<string, unknown> }> = [];
  private secrets = new Map<string, { key: string; valueEncrypted: string }[]>();

  seedBot(botId: string, status: BotStatus): void {
    this.statuses.set(botId, status);
  }

  seedSecrets(botId: string, secrets: { key: string; valueEncrypted: string }[]): void {
    this.secrets.set(botId, secrets);
  }

  async getBotStatus(botId: string): Promise<BotStatus | null> {
    return this.statuses.get(botId) ?? null;
  }

  async updateBotStatus(botId: string, status: BotStatus): Promise<void> {
    this.statuses.set(botId, status);
  }

  async saveBotInstance(botId: string, data: {
    provider: string;
    providerInstanceId: string;
    providerVolumeId: string | null;
    region: string;
    size: string;
    ipAddress: string | null;
  }): Promise<void> {
    this.instances.set(botId, data);
  }

  async deleteBotInstance(botId: string): Promise<void> {
    this.instances.delete(botId);
  }

  async addBotEvent(botId: string, type: string, payload?: Record<string, unknown>): Promise<void> {
    this.events.push({ botId, type, payload });
  }

  async getBotSecrets(botId: string): Promise<{ key: string; valueEncrypted: string }[]> {
    return this.secrets.get(botId) ?? [];
  }

  getStatus(botId: string): BotStatus | undefined {
    return this.statuses.get(botId);
  }

  getInstance(botId: string) {
    return this.instances.get(botId);
  }

  getEvents(botId: string) {
    return this.events.filter((e) => e.botId === botId);
  }
}

describe("JobProcessor", () => {
  let provider: FakeProvider;
  let repo: InMemoryBotRepository;
  let processor: JobProcessor;
  let enqueuedJobs: Array<{ job: AnyJobData; opts?: { delay?: number } }>;
  let enqueueJob: (job: AnyJobData, opts?: { delay?: number }) => Promise<void>;

  beforeEach(() => {
    provider = new FakeProvider();
    repo = new InMemoryBotRepository();
    enqueuedJobs = [];
    enqueueJob = async (job, opts) => {
      enqueuedJobs.push({ job, opts });
    };
    processor = new JobProcessor({ provider, repo, enqueueJob });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("PROVISION_BOT", () => {
    it("transitions bot from provisioning to running and saves instance", async () => {
      const botId = "bot-1";
      repo.seedBot(botId, "provisioning");

      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      expect(repo.getStatus(botId)).toBe("running");
      const instance = repo.getInstance(botId);
      expect(instance).toBeDefined();
      expect(instance!.provider).toBe("fake");
      expect(instance!.region).toBe("nyc3");
      expect(instance!.size).toBe("s-1vcpu-1gb");
      expect(instance!.providerInstanceId).toMatch(/^fake-instance-/);
      expect(instance!.providerVolumeId).toMatch(/^fake-volume-/);
      expect(instance!.ipAddress).toBeDefined();

      const events = repo.getEvents(botId);
      const statusEvent = events.find((e) => e.type === "status_changed");
      expect(statusEvent).toBeDefined();
      expect(statusEvent!.payload).toEqual({
        from: "provisioning",
        to: "running",
        jobType: "PROVISION_BOT",
      });
    });

    it("configures firewall when PLATFORM_PROXY_IPS is set", async () => {
      const botId = "bot-fw-1";
      repo.seedBot(botId, "provisioning");
      vi.stubEnv("PLATFORM_PROXY_IPS", "10.0.0.1, 10.0.0.2 , 10.0.0.3");

      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      const fwCalls = provider.getFirewallCalls();
      expect(fwCalls).toHaveLength(1);
      expect(fwCalls[0].botId).toBe(botId);
      expect(fwCalls[0].allowedInboundIps).toEqual(["10.0.0.1", "10.0.0.2", "10.0.0.3"]);
      expect(fwCalls[0].instanceId).toMatch(/^fake-instance-/);
    });

    it("creates deny-all firewall when PLATFORM_PROXY_IPS is unset", async () => {
      const botId = "bot-fw-2";
      repo.seedBot(botId, "provisioning");
      delete process.env.PLATFORM_PROXY_IPS;

      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      const fwCalls = provider.getFirewallCalls();
      expect(fwCalls).toHaveLength(1);
      expect(fwCalls[0].botId).toBe(botId);
      expect(fwCalls[0].allowedInboundIps).toEqual([]);
      expect(fwCalls[0].instanceId).toMatch(/^fake-instance-/);
      // Provision still succeeds
      expect(repo.getStatus(botId)).toBe("running");
    });

    it("renders userData from encrypted secrets with no unsubstituted placeholders", async () => {
      const botId = "bot-secrets-1";
      repo.seedBot(botId, "provisioning");
      vi.stubEnv("SECRETS_MASTER_KEY", TEST_MASTER_KEY);

      const modelKey = "sk-test-key-12345";
      const modelProvider = "openai";
      const systemInstructions = "You are a helpful bot.";

      repo.seedSecrets(botId, [
        { key: "model_provider_key", valueEncrypted: encrypt(modelKey, TEST_MASTER_KEY) },
        { key: "model_provider", valueEncrypted: encrypt(modelProvider, TEST_MASTER_KEY) },
        { key: "system_instructions", valueEncrypted: encrypt(systemInstructions, TEST_MASTER_KEY) },
      ]);

      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      const capturedUserData = provider.getCapturedUserData(botId);
      expect(capturedUserData).toBeDefined();
      // No unsubstituted {{…}} placeholders remain
      expect(capturedUserData).not.toMatch(/\{\{[^}]+\}\}/);
      // Decrypted secret values are rendered into userData
      expect(capturedUserData).toContain(modelKey);
      expect(capturedUserData).toContain(modelProvider);
      expect(capturedUserData).toContain(systemInstructions);
    });

    it("configureFirewall receives parsed and trimmed platform IPs", async () => {
      const botId = "bot-fw-parse-1";
      repo.seedBot(botId, "provisioning");
      vi.stubEnv("SECRETS_MASTER_KEY", TEST_MASTER_KEY);
      vi.stubEnv("PLATFORM_PROXY_IPS", "  192.168.1.1 , 172.16.0.1,  10.0.0.5  ");

      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      const fwCalls = provider.getFirewallCalls();
      expect(fwCalls).toHaveLength(1);
      expect(fwCalls[0].botId).toBe(botId);
      expect(fwCalls[0].instanceId).toMatch(/^fake-instance-/);
      // IPs are trimmed and parsed correctly
      expect(fwCalls[0].allowedInboundIps).toEqual([
        "192.168.1.1",
        "172.16.0.1",
        "10.0.0.5",
      ]);
    });

    it("renders userData with the provider-specific volume device path", async () => {
      const botId = "bot-vol-path-1";
      repo.seedBot(botId, "provisioning");

      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      const capturedUserData = provider.getCapturedUserData(botId);
      expect(capturedUserData).toBeDefined();
      // Must contain the FakeProvider by-id device path, not the old /dev/sda1
      const expectedDevice = `/dev/disk/by-id/scsi-0FAKE_Volume_bot-${botId}-data`;
      expect(capturedUserData).toContain(expectedDevice);
      expect(capturedUserData).not.toContain("/dev/sda1");
    });

    it("schedules a HEALTH_POLL after successful provision", async () => {
      const botId = "bot-hp-1";
      repo.seedBot(botId, "provisioning");

      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      const healthPolls = enqueuedJobs.filter((j) => j.job.type === "HEALTH_POLL");
      expect(healthPolls).toHaveLength(1);
      expect(healthPolls[0].job.botId).toBe(botId);
      expect(healthPolls[0].opts?.delay).toBe(HEALTH_POLL_INTERVAL_MS);
      const hpJob = healthPolls[0].job as HealthPollJobData;
      expect(hpJob.instanceId).toMatch(/^fake-instance-/);
      expect(hpJob.volumeId).toMatch(/^fake-volume-/);
      expect(hpJob.region).toBe("nyc3");
      expect(hpJob.size).toBe("s-1vcpu-1gb");
    });

    it("retries on RetryableProviderError", async () => {
      const botId = "bot-2";
      repo.seedBot(botId, "provisioning");

      const failingProvider = {
        ...provider,
        name: "fake" as const,
        getVolumeDevicePath: (botId: string) => provider.getVolumeDevicePath(botId),
        createInstance: async () => {
          throw new RetryableProviderError("Temporary failure");
        },
        destroyInstance: provider.destroyInstance.bind(provider),
        destroyVolume: provider.destroyVolume.bind(provider),
        getInstanceStatus: provider.getInstanceStatus.bind(provider),
        attachVolume: provider.attachVolume.bind(provider),
        configureFirewall: provider.configureFirewall.bind(provider),
        injectBootstrap: provider.injectBootstrap.bind(provider),
      };

      const retryProcessor = new JobProcessor({ provider: failingProvider, repo, enqueueJob });
      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await expect(retryProcessor.process(job)).rejects.toThrow(RetryableProviderError);
      // Status should remain provisioning (not changed to error)
      expect(repo.getStatus(botId)).toBe("provisioning");
    });

    it("sets error status on fatal ProviderError", async () => {
      const botId = "bot-3";
      repo.seedBot(botId, "provisioning");

      const failingProvider = {
        ...provider,
        name: "fake" as const,
        getVolumeDevicePath: (botId: string) => provider.getVolumeDevicePath(botId),
        createInstance: async () => {
          throw new ProviderError("Region unavailable", false);
        },
        destroyInstance: provider.destroyInstance.bind(provider),
        destroyVolume: provider.destroyVolume.bind(provider),
        getInstanceStatus: provider.getInstanceStatus.bind(provider),
        attachVolume: provider.attachVolume.bind(provider),
        configureFirewall: provider.configureFirewall.bind(provider),
        injectBootstrap: provider.injectBootstrap.bind(provider),
      };

      const fatalProcessor = new JobProcessor({ provider: failingProvider, repo, enqueueJob });
      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      // Fatal error should NOT rethrow
      await fatalProcessor.process(job);
      expect(repo.getStatus(botId)).toBe("error");

      const events = repo.getEvents(botId);
      const failEvent = events.find((e) => e.type === "job_failed");
      expect(failEvent).toBeDefined();
      expect(failEvent!.payload?.error).toBe("Region unavailable");
    });
  });

  describe("STOP_BOT", () => {
    it("transitions bot from running to stopped", async () => {
      const botId = "bot-4";
      repo.seedBot(botId, "running");

      // Create an instance first so we have an instanceId
      const resources = await provider.createInstance({
        botId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
        userData: "",
        tags: [],
      });

      const job: StopJobData = {
        type: "STOP_BOT",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
      };

      await processor.process(job);

      expect(repo.getStatus(botId)).toBe("stopped");
      expect(provider.getInstanceCount()).toBe(0);
    });
  });

  describe("RESTART_BOT", () => {
    it("reuses existing volume and renders secrets in userData", async () => {
      const botId = "bot-restart-1";
      repo.seedBot(botId, "stopped");
      vi.stubEnv("SECRETS_MASTER_KEY", TEST_MASTER_KEY);

      const modelKey = "sk-restart-key";
      repo.seedSecrets(botId, [
        { key: "model_provider_key", valueEncrypted: encrypt(modelKey, TEST_MASTER_KEY) },
      ]);

      // Create initial instance and volume
      const resources = await provider.createInstance({
        botId,
        region: "sfo3",
        size: "s-2vcpu-2gb",
        userData: "",
        tags: [],
      });

      // Destroy the instance (simulating stop) but keep the volume
      await provider.destroyInstance(resources.instanceId);

      const job: RestartJobData = {
        type: "RESTART_BOT",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
        volumeId: resources.volumeId,
        region: "sfo3",
        size: "s-2vcpu-2gb",
      };

      await processor.process(job);

      expect(repo.getStatus(botId)).toBe("running");

      // Verify same volume is reused
      const instance = repo.getInstance(botId);
      expect(instance).toBeDefined();
      expect(instance!.providerVolumeId).toBe(resources.volumeId);
      expect(instance!.region).toBe("sfo3");
      expect(instance!.size).toBe("s-2vcpu-2gb");

      // Verify userData contains secrets
      const capturedUserData = provider.getCapturedUserData(botId);
      expect(capturedUserData).toBeDefined();
      expect(capturedUserData).toContain(modelKey);
      expect(capturedUserData).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it("honors stored region and size instead of hardcoded defaults", async () => {
      const botId = "bot-restart-region-1";
      repo.seedBot(botId, "stopped");

      const resources = await provider.createInstance({
        botId,
        region: "lon1",
        size: "s-4vcpu-8gb",
        userData: "",
        tags: [],
      });
      await provider.destroyInstance(resources.instanceId);

      const job: RestartJobData = {
        type: "RESTART_BOT",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
        volumeId: resources.volumeId,
        region: "lon1",
        size: "s-4vcpu-8gb",
      };

      await processor.process(job);

      const instance = repo.getInstance(botId);
      expect(instance).toBeDefined();
      expect(instance!.region).toBe("lon1");
      expect(instance!.size).toBe("s-4vcpu-8gb");
    });
  });

  describe("RESUME_BOT", () => {
    it("reuses existing volume and renders secrets in userData", async () => {
      const botId = "bot-resume-1";
      repo.seedBot(botId, "stopped");
      vi.stubEnv("SECRETS_MASTER_KEY", TEST_MASTER_KEY);

      const modelKey = "sk-resume-key";
      repo.seedSecrets(botId, [
        { key: "model_provider_key", valueEncrypted: encrypt(modelKey, TEST_MASTER_KEY) },
      ]);

      const resources = await provider.createInstance({
        botId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
        userData: "",
        tags: [],
      });
      await provider.destroyInstance(resources.instanceId);

      const job: ResumeJobData = {
        type: "RESUME_BOT",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
        volumeId: resources.volumeId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      expect(repo.getStatus(botId)).toBe("running");
      const instance = repo.getInstance(botId);
      expect(instance!.providerVolumeId).toBe(resources.volumeId);

      const capturedUserData = provider.getCapturedUserData(botId);
      expect(capturedUserData).toContain(modelKey);
    });
  });

  describe("DESTROY_BOT", () => {
    it("transitions bot to destroyed and cleans up resources", async () => {
      const botId = "bot-5";
      repo.seedBot(botId, "stopped");

      const resources = await provider.createInstance({
        botId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
        userData: "",
        tags: [],
      });

      await repo.saveBotInstance(botId, {
        provider: "fake",
        providerInstanceId: resources.instanceId,
        providerVolumeId: resources.volumeId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
        ipAddress: resources.ipAddress,
      });

      const job: DestroyJobData = {
        type: "DESTROY_BOT",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
        volumeId: resources.volumeId,
      };

      await processor.process(job);

      expect(repo.getStatus(botId)).toBe("destroyed");
      expect(repo.getInstance(botId)).toBeUndefined();
      expect(provider.getInstanceCount()).toBe(0);
      expect(provider.getVolumeCount()).toBe(0);
    });
  });

  describe("HEALTH_POLL", () => {
    it("runs without transition gating", async () => {
      const botId = "bot-hp-run-1";
      repo.seedBot(botId, "running");

      const resources = await provider.createInstance({
        botId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
        userData: "",
        tags: [],
      });

      const job: HealthPollJobData = {
        type: "HEALTH_POLL",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
        volumeId: resources.volumeId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      // Should succeed without error (HEALTH_POLL is not in JOB_TRANSITIONS)
      await processor.process(job);

      // Status should NOT change
      expect(repo.getStatus(botId)).toBe("running");
    });

    it("schedules the next health poll after completion", async () => {
      const botId = "bot-hp-repeat-1";
      repo.seedBot(botId, "running");

      const resources = await provider.createInstance({
        botId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
        userData: "",
        tags: [],
      });

      const job: HealthPollJobData = {
        type: "HEALTH_POLL",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
        volumeId: resources.volumeId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      const healthPolls = enqueuedJobs.filter((j) => j.job.type === "HEALTH_POLL");
      expect(healthPolls).toHaveLength(1);
      expect(healthPolls[0].opts?.delay).toBe(HEALTH_POLL_INTERVAL_MS);
    });

    it("enqueues RESTART_BOT recovery when instance is not active", async () => {
      const botId = "bot-hp-recover-1";
      repo.seedBot(botId, "running");

      const resources = await provider.createInstance({
        botId,
        region: "sfo3",
        size: "s-2vcpu-2gb",
        userData: "",
        tags: [],
      });

      // Simulate unhealthy instance
      provider.setInstanceStatus(resources.instanceId, "off");

      const job: HealthPollJobData = {
        type: "HEALTH_POLL",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
        volumeId: resources.volumeId,
        region: "sfo3",
        size: "s-2vcpu-2gb",
      };

      await processor.process(job);

      // Should log a health_check_failed event
      const events = repo.getEvents(botId);
      const failEvent = events.find((e) => e.type === "health_check_failed");
      expect(failEvent).toBeDefined();
      expect(failEvent!.payload).toEqual({ instanceStatus: "off" });

      // Should enqueue a RESTART_BOT job for recovery
      const restartJobs = enqueuedJobs.filter((j) => j.job.type === "RESTART_BOT");
      expect(restartJobs).toHaveLength(1);
      const restartJob = restartJobs[0].job as RestartJobData;
      expect(restartJob.botId).toBe(botId);
      expect(restartJob.volumeId).toBe(resources.volumeId);
      expect(restartJob.region).toBe("sfo3");
      expect(restartJob.size).toBe("s-2vcpu-2gb");

      // Should also schedule the next health poll
      const healthPolls = enqueuedJobs.filter((j) => j.job.type === "HEALTH_POLL");
      expect(healthPolls).toHaveLength(1);
    });

    it("does not enqueue recovery when instance is active", async () => {
      const botId = "bot-hp-healthy-1";
      repo.seedBot(botId, "running");

      const resources = await provider.createInstance({
        botId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
        userData: "",
        tags: [],
      });

      const job: HealthPollJobData = {
        type: "HEALTH_POLL",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
        volumeId: resources.volumeId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      const restartJobs = enqueuedJobs.filter((j) => j.job.type === "RESTART_BOT");
      expect(restartJobs).toHaveLength(0);

      const events = repo.getEvents(botId);
      expect(events.find((e) => e.type === "health_check_failed")).toBeUndefined();
    });

    it("does not enqueue recovery when instance is still creating", async () => {
      const botId = "bot-hp-creating-1";
      repo.seedBot(botId, "running");

      const resources = await provider.createInstance({
        botId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
        userData: "",
        tags: [],
      });

      provider.setInstanceStatus(resources.instanceId, "creating");

      const job: HealthPollJobData = {
        type: "HEALTH_POLL",
        botId,
        userId: "user-1",
        instanceId: resources.instanceId,
        volumeId: resources.volumeId,
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);

      const restartJobs = enqueuedJobs.filter((j) => j.job.type === "RESTART_BOT");
      expect(restartJobs).toHaveLength(0);
    });
  });

  describe("Idempotency", () => {
    it("does not create duplicate resources for same provision job", async () => {
      const botId = "bot-6";
      repo.seedBot(botId, "provisioning");

      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);
      const firstInstance = repo.getInstance(botId);

      // Reset status to provisioning to allow re-processing
      repo.seedBot(botId, "provisioning");
      await processor.process(job);
      const secondInstance = repo.getInstance(botId);

      // FakeProvider returns same resource IDs for same botId
      expect(firstInstance!.providerInstanceId).toBe(secondInstance!.providerInstanceId);
      expect(firstInstance!.providerVolumeId).toBe(secondInstance!.providerVolumeId);
      expect(provider.getInstanceCount()).toBe(1);
    });
  });

  describe("Invalid transitions", () => {
    it("skips job when bot is not found", async () => {
      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId: "nonexistent",
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      // Should not throw
      await processor.process(job);
      expect(provider.getInstanceCount()).toBe(0);
    });

    it("skips job when transition is not allowed", async () => {
      const botId = "bot-7";
      repo.seedBot(botId, "running"); // Cannot provision from running

      const job: ProvisionJobData = {
        type: "PROVISION_BOT",
        botId,
        userId: "user-1",
        region: "nyc3",
        size: "s-1vcpu-1gb",
      };

      await processor.process(job);
      // Status unchanged
      expect(repo.getStatus(botId)).toBe("running");
      expect(provider.getInstanceCount()).toBe(0);
    });
  });
});

describe("Dry-run template rendering", () => {
  it("renderCloudInit with sample params produces output with no unsubstituted variables", () => {
    const params = {
      botId: "dry-run-bot-1",
      gatewayToken: "tok_abc123def456",
      clawdbotVersion: "1.2.3",
      modelProviderKey: "sk-test-dry-run",
      modelProvider: "openai",
      systemInstructions: "Be helpful and concise.",
      volumeDevice: "/dev/disk/by-id/scsi-0DO_Volume_bot-dry-run-bot-1-data",
      mountPath: "/data",
    };

    const rendered = renderCloudInit(params);

    // Must not contain any {{…}} placeholders
    expect(rendered).not.toMatch(/\{\{[^}]+\}\}/);

    // Template-substituted values must appear in the output
    expect(rendered).toContain(params.gatewayToken);
    expect(rendered).toContain(params.clawdbotVersion);
    expect(rendered).toContain(params.modelProviderKey);
    expect(rendered).toContain(params.modelProvider);
    expect(rendered).toContain(params.systemInstructions);
    expect(rendered).toContain(params.volumeDevice);
    expect(rendered).toContain(params.mountPath);
  });

  it("renderCloudInit with optional params omitted still has no unsubstituted variables", () => {
    const params = {
      botId: "dry-run-bot-2",
      gatewayToken: "tok_minimal",
      clawdbotVersion: "latest",
      volumeDevice: "/dev/vda1",
      mountPath: "/mnt/data",
    };

    const rendered = renderCloudInit(params);

    // Must not contain any {{…}} placeholders
    expect(rendered).not.toMatch(/\{\{[^}]+\}\}/);

    expect(rendered).toContain(params.gatewayToken);
    expect(rendered).toContain(params.clawdbotVersion);
    expect(rendered).toContain(params.volumeDevice);
    expect(rendered).toContain(params.mountPath);
  });
});
