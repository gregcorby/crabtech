/**
 * Find and destroy resources tagged with bot IDs that don't exist in the database.
 * Usage: DATABASE_URL=xxx DIGITALOCEAN_TOKEN=xxx tsx scripts/cleanup_orphans.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const token = process.env.DIGITALOCEAN_TOKEN;

  if (!token) {
    console.error("DIGITALOCEAN_TOKEN is required");
    process.exit(1);
  }

  const apiBase = "https://api.digitalocean.com/v2";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // Get all droplets tagged with bot:*
  const dropletsRes = await fetch(`${apiBase}/droplets?tag_name=env:staging&per_page=200`, { headers });
  const dropletsData = (await dropletsRes.json()) as {
    droplets: Array<{ id: number; name: string; tags: string[] }>;
  };

  // Get all bot IDs from database
  const bots = await prisma.bot.findMany({
    select: { id: true },
    where: { status: { not: "destroyed" } },
  });
  const activeBotIds = new Set(bots.map((b) => b.id));

  // Find orphaned droplets
  for (const droplet of dropletsData.droplets) {
    const botTag = droplet.tags.find((t) => t.startsWith("bot:"));
    if (!botTag) continue;

    const botId = botTag.replace("bot:", "");
    if (!activeBotIds.has(botId)) {
      console.log(`ORPHAN: Droplet ${droplet.id} (${droplet.name}) for bot ${botId}`);
      if (!dryRun) {
        console.log(`  Destroying droplet ${droplet.id}...`);
        await fetch(`${apiBase}/droplets/${droplet.id}`, { method: "DELETE", headers });
        console.log("  Destroyed.");
      }
    }
  }

  // Get all volumes
  const volumesRes = await fetch(`${apiBase}/volumes?per_page=200`, { headers });
  const volumesData = (await volumesRes.json()) as {
    volumes: Array<{ id: string; name: string; tags: string[] }>;
  };

  for (const volume of volumesData.volumes) {
    const botTag = volume.tags.find((t) => t.startsWith("bot:"));
    if (!botTag) continue;

    const botId = botTag.replace("bot:", "");
    if (!activeBotIds.has(botId)) {
      console.log(`ORPHAN: Volume ${volume.id} (${volume.name}) for bot ${botId}`);
      if (!dryRun) {
        console.log(`  Destroying volume ${volume.id}...`);
        await fetch(`${apiBase}/volumes/${volume.id}`, { method: "DELETE", headers });
        console.log("  Destroyed.");
      }
    }
  }

  if (dryRun) {
    console.log("\nDry run complete. Use without --dry-run to destroy orphans.");
  } else {
    console.log("\nCleanup complete.");
  }
}

main()
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
