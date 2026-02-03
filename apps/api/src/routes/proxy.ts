import type { FastifyInstance } from "fastify";
import httpProxy from "http-proxy";
import { ForbiddenError, NotFoundError, BadRequestError, createLogger } from "@managed-bot/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, getUser } from "../lib/auth.js";

const logger = createLogger("proxy");

// Kill switch: set to true to immediately block all proxy access
let killSwitchActive = false;

export function activateKillSwitch(): void {
  killSwitchActive = true;
  logger.warn("Kill switch activated - all proxy access blocked");
}

export function deactivateKillSwitch(): void {
  killSwitchActive = false;
  logger.info("Kill switch deactivated - proxy access restored");
}

// Bandwidth limiter: max request body size per proxy request
const MAX_PROXY_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

export async function proxyRoutes(app: FastifyInstance) {
  const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
    xfwd: true,
  });

  proxy.on("error", (err, _req, res) => {
    logger.error("Proxy error", { error: err.message });
    if ("writeHead" in res && typeof res.writeHead === "function") {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bot gateway unavailable" }));
    }
  });

  // All proxy routes require auth
  app.addHook("preHandler", requireAuth);

  app.all("/*", async (request, reply) => {
    if (killSwitchActive) {
      throw new ForbiddenError("Service temporarily unavailable");
    }

    // Bandwidth limit: reject oversized request bodies
    const contentLength = request.headers["content-length"];
    if (contentLength && parseInt(contentLength, 10) > MAX_PROXY_BODY_BYTES) {
      throw new BadRequestError(`Request body too large (max ${MAX_PROXY_BODY_BYTES} bytes)`);
    }

    const { userId } = getUser(request);

    // Check subscription
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription || subscription.status !== "active") {
      throw new ForbiddenError("Active subscription required to access bot panel");
    }

    // Get bot instance
    const bot = await prisma.bot.findUnique({
      where: { userId },
      include: { instance: true },
    });
    if (!bot || !bot.instance) {
      throw new NotFoundError("No running bot found");
    }
    if (bot.status !== "running") {
      throw new ForbiddenError("Bot is not currently running");
    }

    const targetUrl = `http://${bot.instance.ipAddress}:8080`;

    // Strip the proxy prefix from the URL
    const targetPath = request.url.replace(/^\/bot\/panel/, "") || "/";

    return new Promise<void>((resolve, reject) => {
      // Modify the request URL to strip prefix
      request.raw.url = targetPath;

      proxy.web(request.raw, reply.raw, { target: targetUrl }, (err) => {
        if (err) {
          logger.error("Proxy forwarding failed", { error: err.message, target: targetUrl });
          reject(err);
        } else {
          resolve();
        }
      });

      // Mark reply as sent since we're handling it via proxy
      reply.hijack();
    });
  });
}
