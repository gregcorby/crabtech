import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { renderCloudInit, renderDockerCompose, renderHealthCheck } from "./renderer.js";
import type { BootstrapParams } from "./types.js";

const validParams: BootstrapParams = {
  botId: "test-bot-123",
  gatewayToken: "gw-token-abc",
  clawdbotVersion: "1.2.3",
  modelProviderKey: "sk-test-key",
  modelProvider: "openai",
  systemInstructions: "You are a helpful assistant.",
  volumeDevice: "/dev/sda1",
  mountPath: "/data",
};

describe("renderCloudInit", () => {
  it("renders cloud-init with all variables substituted", () => {
    const result = renderCloudInit(validParams);

    expect(result).toContain("gw-token-abc");
    expect(result).toContain("1.2.3");
    expect(result).toContain("sk-test-key");
    expect(result).toContain("openai");
    expect(result).toContain("You are a helpful assistant.");
    expect(result).toContain("/dev/sda1");
    expect(result).toContain("/data");
  });

  it("contains no unsubstituted template variables", () => {
    const result = renderCloudInit(validParams);
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("is valid cloud-init (starts with #cloud-config)", () => {
    const result = renderCloudInit(validParams);
    expect(result.trimStart()).toMatch(/^#cloud-config/);
  });

  it("contains docker compose service definition", () => {
    const result = renderCloudInit(validParams);
    expect(result).toContain("clawdbot");
    expect(result).toContain("docker compose");
  });

  it("uses defaults for optional params", () => {
    const minParams: BootstrapParams = {
      botId: "bot-min",
      gatewayToken: "token-min",
      clawdbotVersion: "latest",
      volumeDevice: "/dev/sda1",
      mountPath: "/data",
    };
    const result = renderCloudInit(minParams);
    expect(result).toContain("token-min");
    expect(result).toContain("latest");
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("includes systemd service for clawdbot", () => {
    const result = renderCloudInit(validParams);
    expect(result).toContain("clawdbot.service");
    expect(result).toContain("systemctl enable");
  });

  it("includes Docker installation steps", () => {
    const result = renderCloudInit(validParams);
    expect(result).toContain("docker-ce");
    expect(result).toContain("apt-get install");
  });
});

describe("renderCloudInit – escaping", () => {
  it("escapes double quotes in user-supplied values", () => {
    const params: BootstrapParams = {
      ...validParams,
      gatewayToken: 'token-with-"quotes"',
      systemInstructions: 'Say "hello" to the user.',
    };
    const result = renderCloudInit(params);

    expect(result).toContain('token-with-\\"quotes\\"');
    expect(result).toContain('Say \\"hello\\" to the user.');
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("escapes newlines in user-supplied values", () => {
    const params: BootstrapParams = {
      ...validParams,
      systemInstructions: "line one\nline two\nline three",
    };
    const result = renderCloudInit(params);

    expect(result).toContain("line one\\nline two\\nline three");
    // The literal newline should NOT appear inside the quoted value
    expect(result).not.toContain('SYSTEM_INSTRUCTIONS: "line one\nline two');
  });

  it("escapes backslashes in user-supplied values", () => {
    const params: BootstrapParams = {
      ...validParams,
      modelProviderKey: "key\\with\\backslashes",
    };
    const result = renderCloudInit(params);

    expect(result).toContain("key\\\\with\\\\backslashes");
  });

  it("escapes a combination of quotes, newlines, and backslashes", () => {
    const params: BootstrapParams = {
      ...validParams,
      systemInstructions: 'Say "hi".\nThen use a \\ backslash.',
    };
    const result = renderCloudInit(params);

    expect(result).toContain('Say \\"hi\\".\\nThen use a \\\\ backslash.');
  });
});

describe("renderDockerCompose", () => {
  it("renders docker-compose with all variables substituted", () => {
    const result = renderDockerCompose(validParams);

    expect(result).toContain("1.2.3");
    expect(result).toContain("gw-token-abc");
    expect(result).toContain("openai");
    expect(result).toContain("/data");
  });

  it("contains no unsubstituted template variables", () => {
    const result = renderDockerCompose(validParams);
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("defines the clawdbot service", () => {
    const result = renderDockerCompose(validParams);
    expect(result).toContain("clawdbot");
    expect(result).toContain("8080");
  });

  it("mounts the data volume", () => {
    const result = renderDockerCompose(validParams);
    expect(result).toContain("/data:/data");
  });
});

describe("renderDockerCompose – escaping", () => {
  it("escapes double quotes in user-supplied values", () => {
    const params: BootstrapParams = {
      ...validParams,
      gatewayToken: 'token-with-"quotes"',
      systemInstructions: 'Say "hello" to the user.',
    };
    const result = renderDockerCompose(params);

    expect(result).toContain('token-with-\\"quotes\\"');
    expect(result).toContain('Say \\"hello\\" to the user.');
  });

  it("escapes newlines in user-supplied values", () => {
    const params: BootstrapParams = {
      ...validParams,
      systemInstructions: "line one\nline two",
    };
    const result = renderDockerCompose(params);

    expect(result).toContain("line one\\nline two");
    expect(result).not.toContain('SYSTEM_INSTRUCTIONS: "line one\nline two');
  });

  it("escapes backslashes in user-supplied values", () => {
    const params: BootstrapParams = {
      ...validParams,
      modelProviderKey: "key\\with\\backslashes",
    };
    const result = renderDockerCompose(params);

    expect(result).toContain("key\\\\with\\\\backslashes");
  });
});

describe("renderDockerCompose – YAML parsing validation", () => {
  function parseDockerComposeEnv(rendered: string): Record<string, string> {
    const parsed = yaml.load(rendered) as {
      services: { clawdbot: { environment: Record<string, string> } };
    };
    return parsed.services.clawdbot.environment;
  }

  it("produces valid YAML with standard values", () => {
    const rendered = renderDockerCompose(validParams);
    expect(() => yaml.load(rendered)).not.toThrow();
    const env = parseDockerComposeEnv(rendered);
    expect(env.GATEWAY_TOKEN).toBe("gw-token-abc");
    expect(env.MODEL_PROVIDER).toBe("openai");
    expect(env.MODEL_PROVIDER_KEY).toBe("sk-test-key");
    expect(env.SYSTEM_INSTRUCTIONS).toBe("You are a helpful assistant.");
  });

  it("produces valid YAML when values contain colons", () => {
    const params: BootstrapParams = {
      ...validParams,
      systemInstructions: "You: are helpful",
      gatewayToken: "token:with:colons",
    };
    const rendered = renderDockerCompose(params);
    expect(() => yaml.load(rendered)).not.toThrow();
    const env = parseDockerComposeEnv(rendered);
    expect(env.SYSTEM_INSTRUCTIONS).toBe("You: are helpful");
    expect(env.GATEWAY_TOKEN).toBe("token:with:colons");
  });

  it("produces valid YAML when values contain hash characters", () => {
    const params: BootstrapParams = {
      ...validParams,
      systemInstructions: "Use # for comments",
    };
    const rendered = renderDockerCompose(params);
    expect(() => yaml.load(rendered)).not.toThrow();
    const env = parseDockerComposeEnv(rendered);
    expect(env.SYSTEM_INSTRUCTIONS).toBe("Use # for comments");
  });

  it("produces valid YAML when values contain double quotes", () => {
    const params: BootstrapParams = {
      ...validParams,
      gatewayToken: 'token-with-"quotes"',
      systemInstructions: 'Say "hello" to the user.',
    };
    const rendered = renderDockerCompose(params);
    expect(() => yaml.load(rendered)).not.toThrow();
    const env = parseDockerComposeEnv(rendered);
    expect(env.GATEWAY_TOKEN).toBe('token-with-"quotes"');
    expect(env.SYSTEM_INSTRUCTIONS).toBe('Say "hello" to the user.');
  });

  it("produces valid YAML when values contain newlines", () => {
    const params: BootstrapParams = {
      ...validParams,
      systemInstructions: "line one\nline two\nline three",
    };
    const rendered = renderDockerCompose(params);
    expect(() => yaml.load(rendered)).not.toThrow();
    const env = parseDockerComposeEnv(rendered);
    expect(env.SYSTEM_INSTRUCTIONS).toBe("line one\nline two\nline three");
  });

  it("produces valid YAML when values contain backslashes", () => {
    const params: BootstrapParams = {
      ...validParams,
      modelProviderKey: "key\\with\\backslashes",
    };
    const rendered = renderDockerCompose(params);
    expect(() => yaml.load(rendered)).not.toThrow();
    const env = parseDockerComposeEnv(rendered);
    expect(env.MODEL_PROVIDER_KEY).toBe("key\\with\\backslashes");
  });

  it("produces valid YAML with leading digits in values", () => {
    const params: BootstrapParams = {
      ...validParams,
      gatewayToken: "12345-token",
    };
    const rendered = renderDockerCompose(params);
    expect(() => yaml.load(rendered)).not.toThrow();
    const env = parseDockerComposeEnv(rendered);
    expect(env.GATEWAY_TOKEN).toBe("12345-token");
  });

  it("produces valid YAML when optional params are omitted (empty strings)", () => {
    const minParams: BootstrapParams = {
      botId: "bot-min",
      gatewayToken: "token-min",
      clawdbotVersion: "latest",
      volumeDevice: "/dev/sda1",
      mountPath: "/data",
    };
    const rendered = renderDockerCompose(minParams);
    expect(() => yaml.load(rendered)).not.toThrow();
    const env = parseDockerComposeEnv(rendered);
    expect(env.MODEL_PROVIDER).toBe("");
    expect(env.MODEL_PROVIDER_KEY).toBe("");
    expect(env.SYSTEM_INSTRUCTIONS).toBe("");
  });

  it("produces valid YAML with combined special characters", () => {
    const params: BootstrapParams = {
      ...validParams,
      systemInstructions: 'Say "hi".\nThen use a \\ backslash: and # comment.',
    };
    const rendered = renderDockerCompose(params);
    expect(() => yaml.load(rendered)).not.toThrow();
    const env = parseDockerComposeEnv(rendered);
    expect(env.SYSTEM_INSTRUCTIONS).toBe(
      'Say "hi".\nThen use a \\ backslash: and # comment.',
    );
  });
});

describe("renderHealthCheck", () => {
  it("renders health check script", () => {
    const result = renderHealthCheck();
    expect(result).toContain("#!/bin/bash");
    expect(result).toContain("health");
    expect(result).toContain("curl");
  });

  it("includes retry logic", () => {
    const result = renderHealthCheck();
    expect(result).toContain("MAX_RETRIES");
    expect(result).toContain("RETRY_DELAY");
  });
});
