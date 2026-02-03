const REDACT_PATTERNS = [
  /\b(sk-[a-zA-Z0-9]{20,})\b/g,           // OpenAI-style keys
  /\b(key-[a-zA-Z0-9]{20,})\b/g,           // Generic API keys
  /\b(ghp_[a-zA-Z0-9]{36,})\b/g,           // GitHub PATs
  /\b(xoxb-[a-zA-Z0-9-]{20,})\b/g,         // Slack bot tokens
  /\b(dop_v1_[a-zA-Z0-9]{64})\b/g,         // DigitalOcean PATs
  /\b([a-zA-Z0-9+/]{40,}={0,2})\b/g,       // Long base64 blobs (heuristic)
];

const REDACT_FIELDS = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "apiKey",
  "api_key",
  "secret",
  "token",
  "authorization",
  "valueEncrypted",
  "value_encrypted",
  "masterKey",
  "SECRETS_MASTER_KEY",
]);

function redactString(value: string): string {
  let result = value;
  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return redactString(obj);
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACT_FIELDS.has(key)) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      redacted[key] = redactString(value);
    } else if (typeof value === "object") {
      redacted[key] = redactObject(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

function formatLog(level: LogLevel, message: string, data?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const redactedData = data ? redactObject(data) : undefined;
  const entry = {
    timestamp,
    level,
    message: redactString(message),
    ...(redactedData ? { data: redactedData } : {}),
  };
  return JSON.stringify(entry);
}

export function createLogger(context?: string): Logger {
  const prefix = context ? `[${context}] ` : "";

  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (process.env.LOG_LEVEL === "debug") {
        console.debug(formatLog("debug", prefix + message, data));
      }
    },
    info(message: string, data?: Record<string, unknown>) {
      console.info(formatLog("info", prefix + message, data));
    },
    warn(message: string, data?: Record<string, unknown>) {
      console.warn(formatLog("warn", prefix + message, data));
    },
    error(message: string, data?: Record<string, unknown>) {
      console.error(formatLog("error", prefix + message, data));
    },
  };
}
