import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function signupAndGetCookie(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email, password },
  });
  const cookie = res.headers["set-cookie"];
  if (!cookie) {
    throw new Error(`Signup failed for ${email}: ${res.body}`);
  }
  // Extract session cookie value
  const match = (Array.isArray(cookie) ? cookie[0] : cookie).match(/session=([^;]+)/);
  if (!match) {
    throw new Error("No session cookie found");
  }
  return `session=${match[1]}`;
}

let counter = 0;
export function uniqueEmail(): string {
  counter++;
  return `test-${Date.now()}-${counter}@example.com`;
}
