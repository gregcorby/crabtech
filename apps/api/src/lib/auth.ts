import jwt from "jsonwebtoken";
import type { FastifyRequest, FastifyReply } from "fastify";
import { UnauthorizedError } from "@managed-bot/shared";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";
const TOKEN_EXPIRY = "7d";

export interface AuthPayload {
  userId: string;
  email: string;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}

export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const token =
    request.cookies.session ??
    request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    throw new UnauthorizedError();
  }

  const payload = verifyToken(token);
  (request as FastifyRequest & { user: AuthPayload }).user = payload;
}

export function getUser(request: FastifyRequest): AuthPayload {
  const user = (request as FastifyRequest & { user?: AuthPayload }).user;
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}
