import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeProvider } from "@managed-bot/infra";
import type { BotStatus } from "@managed-bot/shared";
import { ProviderError, RetryableProviderError, encrypt } from "@managed-bot/shared";
import { renderCloudInit } from "@managed-bot/runtime";
import { JobProcessor } from "./processor.js";
import type { BotRepository } from "./processor.js";
import type { AnyJobData, ProvisionJobData, StopJobData, DestroyJobData } from "./jobs.js";

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

  beforeEach(() => {
    provider = new FakeProvider();
    repo = new InMemoryBotRepository();
    processor = new JobProcessor({ provider, repo });
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

    it("skips firewall configuration when PLATFORM_PROXY_IPS is unset", async () => {
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

      expect(provider.getFirewallCalls()).toHaveLength(0);
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

    it("retries on RetryableProviderError", async () => {
      const botId = "bot-2";
      repo.seedBot(botId, "provisioning");

      const failingProvider = {
        ...provider,
        name: "fake" as const,
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

      const retryProcessor = new JobProcessor({ provider: failingProvider, repo });
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

      const fatalProcessor = new JobProcessor({ provider: failingProvider, repo });
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
      volumeDevice: "/dev/sda1",
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
