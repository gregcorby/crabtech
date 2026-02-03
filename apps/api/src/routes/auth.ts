import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  signupSchema,
  loginSchema,
} from "@managed-bot/shared";
import { prisma } from "../lib/prisma.js";
import { signToken, requireAuth, getUser } from "../lib/auth.js";
import { zodBody } from "../lib/schema.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/signup", { schema: zodBody(signupSchema) }, async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0].message);
    }

    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError("Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    // Create inactive subscription record
    await prisma.subscription.create({
      data: { userId: user.id, status: "inactive" },
    });

    const token = signToken({ userId: user.id, email: user.email });

    reply.setCookie("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return {
      user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() },
    };
  });

  app.post("/login", { schema: zodBody(loginSchema) }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0].message);
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = signToken({ userId: user.id, email: user.email });

    reply.setCookie("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return {
      user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() },
    };
  });

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });

  app.get("/me", { preHandler: [requireAuth] }, async (request) => {
    const { userId } = getUser(request);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedError("User not found");
    }
    return {
      user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() },
    };
  });
}
