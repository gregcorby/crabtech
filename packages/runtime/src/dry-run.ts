/**
 * Dry-run script: renders all runtime templates with sample params and prints them.
 * Usage: tsx packages/runtime/src/dry-run.ts
 */

import { renderCloudInit, renderDockerCompose, renderHealthCheck } from "./renderer.js";

const sampleParams = {
  botId: "dry-run-bot-001",
  gatewayToken: "sample-gateway-token-abc123",
  clawdbotVersion: "latest",
  modelProviderKey: "sk-sample-key",
  modelProvider: "openai",
  systemInstructions: "You are a helpful coding assistant.",
  volumeDevice: "/dev/disk/by-id/scsi-0DO_Volume_bot-dry-run-bot-001-data",
  mountPath: "/data",
};

console.log("=== Cloud-Init Template ===\n");
console.log(renderCloudInit(sampleParams));

console.log("\n=== Docker Compose Template ===\n");
console.log(renderDockerCompose(sampleParams));

console.log("\n=== Health Check Script ===\n");
console.log(renderHealthCheck());

console.log("\n=== Validation: No unsubstituted variables ===");
const cloudInit = renderCloudInit(sampleParams);
const dockerCompose = renderDockerCompose(sampleParams);
const unsubstituted = /\{\{[A-Z_]+\}\}/g;
const cloudInitMatches = cloudInit.match(unsubstituted);
const dockerComposeMatches = dockerCompose.match(unsubstituted);

if (cloudInitMatches || dockerComposeMatches) {
  console.error("FAIL: Found unsubstituted variables:");
  if (cloudInitMatches) console.error("  cloud-init:", cloudInitMatches);
  if (dockerComposeMatches) console.error("  docker-compose:", dockerComposeMatches);
  process.exit(1);
} else {
  console.log("PASS: All template variables substituted.");
}
