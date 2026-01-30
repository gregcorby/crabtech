import { randomUUID } from "node:crypto";
import type {
  ComputeProvider,
  CreateInstanceParams,
  AttachVolumeParams,
  FirewallParams,
  BootstrapParams,
  ProviderResourceIds,
  InstanceStatus,
} from "./provider.js";

interface FakeInstance {
  id: string;
  botId: string;
  status: InstanceStatus;
  volumeId: string | null;
  userData: string;
  tags: string[];
}

interface FakeVolume {
  id: string;
  botId: string;
  region: string;
  sizeGb: number;
  attachedTo: string | null;
}

export class FakeProvider implements ComputeProvider {
  readonly name = "fake";

  private instances = new Map<string, FakeInstance>();
  private volumes = new Map<string, FakeVolume>();
  private idempotencyMap = new Map<string, ProviderResourceIds>();

  async createInstance(params: CreateInstanceParams): Promise<ProviderResourceIds> {
    // Idempotency: return existing if same botId
    const existing = this.idempotencyMap.get(params.botId);
    if (existing) {
      return existing;
    }

    const instanceId = `fake-instance-${randomUUID()}`;
    const volumeId = `fake-volume-${randomUUID()}`;
    const ipAddress = `10.0.0.${Math.floor(Math.random() * 254) + 1}`;

    this.instances.set(instanceId, {
      id: instanceId,
      botId: params.botId,
      status: "active",
      volumeId,
      userData: params.userData,
      tags: params.tags,
    });

    this.volumes.set(volumeId, {
      id: volumeId,
      botId: params.botId,
      region: params.region,
      sizeGb: 25,
      attachedTo: instanceId,
    });

    const result: ProviderResourceIds = { instanceId, volumeId, ipAddress };
    this.idempotencyMap.set(params.botId, result);
    return result;
  }

  async attachVolume(params: AttachVolumeParams): Promise<{ volumeId: string }> {
    const existing = this.volumes.get(params.volumeId);
    if (existing) {
      existing.attachedTo = params.instanceId;
      return { volumeId: params.volumeId };
    }

    const volumeId = params.volumeId || `fake-volume-${randomUUID()}`;
    this.volumes.set(volumeId, {
      id: volumeId,
      botId: params.botId,
      region: params.region,
      sizeGb: params.sizeGb,
      attachedTo: params.instanceId,
    });
    return { volumeId };
  }

  async configureFirewall(_params: FirewallParams): Promise<void> {
    // No-op for fake provider
  }

  async injectBootstrap(_params: BootstrapParams): Promise<void> {
    // No-op for fake provider
  }

  async destroyInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      this.idempotencyMap.delete(instance.botId);
    }
    this.instances.delete(instanceId);
  }

  async destroyVolume(volumeId: string): Promise<void> {
    this.volumes.delete(volumeId);
  }

  async getInstanceStatus(instanceId: string): Promise<InstanceStatus> {
    const instance = this.instances.get(instanceId);
    return instance?.status ?? "not_found";
  }

  // Test helpers
  getInstanceCount(): number {
    return this.instances.size;
  }

  getVolumeCount(): number {
    return this.volumes.size;
  }

  reset(): void {
    this.instances.clear();
    this.volumes.clear();
    this.idempotencyMap.clear();
  }
}
