/**
 * Staging script: provision a single bot
 * Usage: DIGITALOCEAN_TOKEN=xxx tsx scripts/staging_provision_one.ts <botId>
 */

import { DigitalOceanProvider } from "@managed-bot/infra";
import { renderCloudInit } from "@managed-bot/runtime";
import { randomUUID } from "node:crypto";

async function main() {
  const botId = process.argv[2] ?? `staging-bot-${randomUUID().slice(0, 8)}`;
  const token = process.env.DIGITALOCEAN_TOKEN;
  if (!token) {
    console.error("DIGITALOCEAN_TOKEN is required");
    process.exit(1);
  }

  const provider = new DigitalOceanProvider(token);

  const cloudInit = renderCloudInit({
    botId,
    gatewayToken: randomUUID(),
    clawdbotVersion: "latest",
    volumeDevice: "/dev/disk/by-id/scsi-0DO_Volume_bot-" + botId + "-data",
    mountPath: "/data",
  });

  console.log(`Provisioning bot: ${botId}`);

  const resources = await provider.createInstance({
    botId,
    region: "nyc3",
    size: "s-1vcpu-1gb",
    userData: cloudInit,
    tags: [`bot:${botId}`, "env:staging"],
  });

  console.log("Provisioned resources:", resources);

  await provider.configureFirewall({
    botId,
    instanceId: resources.instanceId,
    allowedInboundIps: [], // No public access for staging
  });

  console.log("Firewall configured");
  console.log(`Done. Instance ID: ${resources.instanceId}, Volume ID: ${resources.volumeId}`);
}

main().catch((err) => {
  console.error("Provision failed:", err);
  process.exit(1);
});
