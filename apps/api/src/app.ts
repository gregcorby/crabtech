import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyRateLimit from "@fastify/rate-limit";
import rawBody from "fastify-raw-body";
import { AppError } from "@managed-bot/shared";
import { authRoutes } from "./routes/auth.js";
import { botRoutes } from "./routes/bot.js";
import { billingRoutes } from "./routes/billing.js";
import { healthRoutes } from "./routes/health.js";
import { proxyRoutes } from "./routes/proxy.js";

export async function buildApp() {
  const app = Fastify({
    logger: false,
  });

  // Plugins
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET ?? "dev-cookie-secret-change-me",
  });

  await app.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(rawBody, {
    global: false,
    runFirst: true,
    encoding: "utf8",
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Managed Bot Platform API",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "session",
          },
        },
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
  });

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.errorCode,
        message: error.message,
      });
    }

    // Fastify validation errors
    if (error instanceof Error && "validation" in error) {
      return reply.status(400).send({
        statusCode: 400,
        error: "VALIDATION_ERROR",
        message: error.message,
      });
    }

    console.error("Unhandled error:", error);
    return reply.status(500).send({
      statusCode: 500,
      error: "INTERNAL_ERROR",
      message: "Internal server error",
    });
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(botRoutes, { prefix: "/bot" });
  await app.register(billingRoutes, { prefix: "/billing" });
  await app.register(proxyRoutes, { prefix: "/bot/panel" });

  return app;
}
