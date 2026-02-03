/**
 * Staging script: destroy a single bot's resources
 * Usage: DIGITALOCEAN_TOKEN=xxx tsx scripts/staging_destroy_one.ts <instanceId> [volumeId]
 */

import { DigitalOceanProvider } from "@managed-bot/infra";

async function main() {
  const instanceId = process.argv[2];
  const volumeId = process.argv[3];
  const token = process.env.DIGITALOCEAN_TOKEN;

  if (!token) {
    console.error("DIGITALOCEAN_TOKEN is required");
    process.exit(1);
  }
  if (!instanceId) {
    console.error("Usage: tsx scripts/staging_destroy_one.ts <instanceId> [volumeId]");
    process.exit(1);
  }

  const provider = new DigitalOceanProvider(token);

  console.log(`Destroying instance: ${instanceId}`);
  await provider.destroyInstance(instanceId);
  console.log("Instance destroyed");

  if (volumeId) {
    console.log(`Destroying volume: ${volumeId}`);
    await provider.destroyVolume(volumeId);
    console.log("Volume destroyed");
  }

  console.log("Cleanup complete");
}

main().catch((err) => {
  console.error("Destroy failed:", err);
  process.exit(1);
});
