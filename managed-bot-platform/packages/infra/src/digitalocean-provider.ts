import { createLogger, RetryableProviderError, FatalProviderError } from "@managed-bot/shared";
import type {
  ComputeProvider,
  CreateInstanceParams,
  AttachVolumeParams,
  FirewallParams,
  BootstrapParams,
  ProviderResourceIds,
  InstanceStatus,
} from "./provider.js";

const logger = createLogger("DigitalOceanProvider");

interface DOApiOptions {
  method: string;
  path: string;
  body?: unknown;
}

export class DigitalOceanProvider implements ComputeProvider {
  readonly name = "digitalocean";
  private apiToken: string;
  private baseUrl = "https://api.digitalocean.com/v2";

  constructor(apiToken: string) {
    if (!apiToken) {
      throw new Error("DigitalOcean API token is required");
    }
    this.apiToken = apiToken;
  }

  private async apiCall<T>(options: DOApiOptions): Promise<T> {
    const url = `${this.baseUrl}${options.path}`;
    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status >= 500 || response.status === 429) {
        throw new RetryableProviderError(
          `DigitalOcean API error ${response.status}: ${errorBody}`,
        );
      }
      throw new FatalProviderError(
        `DigitalOcean API error ${response.status}: ${errorBody}`,
      );
    }

    if (response.status === 204) {
      return {} as T;
    }
    return response.json() as Promise<T>;
  }

  async createInstance(params: CreateInstanceParams): Promise<ProviderResourceIds> {
    // Create volume first
    const volumeResp = await this.apiCall<{ volume: { id: string } }>({
      method: "POST",
      path: "/volumes",
      body: {
        size_gigabytes: 25,
        name: `bot-${params.botId}-data`,
        region: params.region,
        filesystem_type: "ext4",
        tags: params.tags,
      },
    });
    const volumeId = volumeResp.volume.id;
    logger.info("Created volume", { volumeId, botId: params.botId });

    try {
      // Create droplet with volume attached and cloud-init
      const dropletResp = await this.apiCall<{
        droplet: { id: number; networks: { v4: Array<{ ip_address: string; type: string }> } };
      }>({
        method: "POST",
        path: "/droplets",
        body: {
          name: `bot-${params.botId}`,
          region: params.region,
          size: params.size,
          image: "ubuntu-24-04-x64",
          volumes: [volumeId],
          user_data: params.userData,
          tags: params.tags,
          ssh_keys: [],
          monitoring: true,
        },
      });

      const droplet = dropletResp.droplet;
      const instanceId = String(droplet.id);
      const publicIp = droplet.networks?.v4?.find((n) => n.type === "public")?.ip_address ?? null;

      logger.info("Created droplet", { instanceId, botId: params.botId });

      return {
        instanceId,
        volumeId,
        ipAddress: publicIp,
      };
    } catch (err) {
      // Cleanup volume on droplet creation failure
      logger.error("Droplet creation failed, cleaning up volume", { volumeId });
      try {
        await this.destroyVolume(volumeId);
      } catch (cleanupErr) {
        logger.error("Failed to cleanup volume after droplet failure", {
          volumeId,
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
      throw err;
    }
  }

  async attachVolume(params: AttachVolumeParams): Promise<{ volumeId: string }> {
    await this.apiCall({
      method: "POST",
      path: `/volumes/${params.volumeId}/actions`,
      body: {
        type: "attach",
        droplet_id: parseInt(params.instanceId, 10),
        region: params.region,
      },
    });
    return { volumeId: params.volumeId };
  }

  async configureFirewall(params: FirewallParams): Promise<void> {
    await this.apiCall({
      method: "POST",
      path: "/firewalls",
      body: {
        name: `bot-${params.botId}-fw`,
        inbound_rules: params.allowedInboundIps.map((ip) => ({
          protocol: "tcp",
          ports: "8080",
          sources: { addresses: [ip] },
        })),
        outbound_rules: [
          {
            protocol: "tcp",
            ports: "443",
            destinations: { addresses: ["0.0.0.0/0"] },
          },
          {
            protocol: "tcp",
            ports: "80",
            destinations: { addresses: ["0.0.0.0/0"] },
          },
          {
            protocol: "udp",
            ports: "53",
            destinations: { addresses: ["0.0.0.0/0"] },
          },
        ],
        droplet_ids: [parseInt(params.instanceId, 10)],
        tags: [`bot:${params.botId}`],
      },
    });
  }

  async injectBootstrap(params: BootstrapParams): Promise<void> {
    // Cloud-init is injected at droplet creation via user_data
    // This method exists for providers that require post-creation injection
    logger.info("Bootstrap is handled via cloud-init user_data at creation time", {
      instanceId: params.instanceId,
    });
  }

  async destroyInstance(instanceId: string): Promise<void> {
    await this.apiCall({
      method: "DELETE",
      path: `/droplets/${instanceId}`,
    });
    logger.info("Destroyed droplet", { instanceId });
  }

  async destroyVolume(volumeId: string): Promise<void> {
    await this.apiCall({
      method: "DELETE",
      path: `/volumes/${volumeId}`,
    });
    logger.info("Destroyed volume", { volumeId });
  }

  async getInstanceStatus(instanceId: string): Promise<InstanceStatus> {
    try {
      const resp = await this.apiCall<{ droplet: { status: string } }>({
        method: "GET",
        path: `/droplets/${instanceId}`,
      });
      const doStatus = resp.droplet.status;
      switch (doStatus) {
        case "new":
          return "creating";
        case "active":
          return "active";
        case "off":
          return "off";
        case "archive":
          return "archive";
        default:
          return "error";
      }
    } catch (err) {
      if (err instanceof FatalProviderError && err.message.includes("404")) {
        return "not_found";
      }
      throw err;
    }
  }
}
