import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { type BootstrapParams, bootstrapParamsSchema } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "../templates");

/**
 * Escape a string for safe inclusion inside a YAML double-quoted scalar.
 * Handles backslashes, double quotes, and newlines so that user-supplied
 * values cannot break the surrounding YAML/compose structure.
 */
function escapeForYamlDoubleQuote(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function loadTemplate(name: string): string {
  return readFileSync(resolve(TEMPLATES_DIR, name), "utf-8");
}

export function renderCloudInit(params: BootstrapParams): string {
  const validated = bootstrapParamsSchema.parse(params);
  const template = loadTemplate("cloud-init.yaml");
  return renderTemplate(template, {
    BOT_ID: validated.botId,
    GATEWAY_TOKEN: escapeForYamlDoubleQuote(validated.gatewayToken),
    CLAWDBOT_VERSION: validated.clawdbotVersion,
    MODEL_PROVIDER_KEY: escapeForYamlDoubleQuote(validated.modelProviderKey ?? ""),
    MODEL_PROVIDER: escapeForYamlDoubleQuote(validated.modelProvider ?? ""),
    SYSTEM_INSTRUCTIONS: escapeForYamlDoubleQuote(validated.systemInstructions ?? ""),
    VOLUME_DEVICE: validated.volumeDevice,
    MOUNT_PATH: validated.mountPath,
  });
}

export function renderDockerCompose(params: BootstrapParams): string {
  const validated = bootstrapParamsSchema.parse(params);
  const template = loadTemplate("docker-compose.yml");
  return renderTemplate(template, {
    BOT_ID: validated.botId,
    GATEWAY_TOKEN: escapeForYamlDoubleQuote(validated.gatewayToken),
    CLAWDBOT_VERSION: validated.clawdbotVersion,
    MODEL_PROVIDER_KEY: escapeForYamlDoubleQuote(validated.modelProviderKey ?? ""),
    MODEL_PROVIDER: escapeForYamlDoubleQuote(validated.modelProvider ?? ""),
    SYSTEM_INSTRUCTIONS: escapeForYamlDoubleQuote(validated.systemInstructions ?? ""),
    MOUNT_PATH: validated.mountPath,
  });
}

export function renderHealthCheck(): string {
  return loadTemplate("health-check.sh");
}
