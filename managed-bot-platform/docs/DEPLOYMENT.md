# Deployment Checklist

## Environment Variables

### Required for All Environments
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `REDIS_URL` - Redis connection string
- [ ] `JWT_SECRET` - Secret for signing JWT tokens (min 32 chars)
- [ ] `COOKIE_SECRET` - Secret for cookie signing (min 32 chars)
- [ ] `SECRETS_MASTER_KEY` - Master encryption key for bot secrets (min 32 chars)
- [ ] `CORS_ORIGIN` - Allowed CORS origin for the frontend

### Production Only
- [ ] `DIGITALOCEAN_TOKEN` - DigitalOcean API token
- [ ] `STRIPE_SECRET_KEY` - Stripe secret key
- [ ] `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- [ ] `NODE_ENV=production`

## Infrastructure Checklist

### Database
- [ ] PostgreSQL provisioned and accessible
- [ ] Automatic backups enabled
- [ ] Migrations applied (`pnpm db:migrate`)
- [ ] Connection pooling configured

### Redis
- [ ] Redis provisioned and accessible
- [ ] Persistence enabled (AOF or RDB)

### Networking
- [ ] Proxy private networking configured (VPC or WireGuard)
- [ ] Bot VMs have no public inbound access
- [ ] Firewall rules verified
- [ ] TLS certificates configured for the public domain

### Stripe
- [ ] Webhook endpoint configured in Stripe dashboard
- [ ] Webhook signing secret set in environment
- [ ] Test mode verified before going live

### Monitoring
- [ ] Alerts configured for provision failure spikes
- [ ] Health polling jobs scheduled for all running bots
- [ ] Log aggregation configured
- [ ] Monitoring dashboards created

## Security Hardening

### Rate Limiting
- [ ] Global rate limit configured (100 req/min default via `@fastify/rate-limit`)
- [ ] Auth endpoints rate-limited to prevent brute force

### Restart Throttling
- [ ] Bot restart cooldown enforced (1 minute between restart requests)
- [ ] Throttle check uses `bot_restart_requested` events in `bot_events` table

### Bandwidth Limits
- [ ] Proxy request body size limited to 10 MB (`MAX_PROXY_BODY_BYTES`)
- [ ] Content-Length header validated before proxying

### Cross-Tenant Authorization
- [ ] All bot routes scoped to `userId` from JWT (no bot ID in request path)
- [ ] Cross-tenant tests verify User A cannot access/modify User B's bot
- [ ] Proxy validates subscription status and bot ownership before forwarding

### Log Redaction
- [ ] Logger redacts API keys (OpenAI `sk-*`, GitHub `ghp_*`, Slack `xoxb-*`, DigitalOcean `dop_v1_*`)
- [ ] Logger redacts sensitive fields (`password`, `apiKey`, `secret`, `token`, `valueEncrypted`, `SECRETS_MASTER_KEY`)
- [ ] Unit tests verify sentinel strings never appear in log output

### Secrets
- [ ] All bot secrets encrypted at rest with AES-256-GCM
- [ ] Master key is at least 32 characters
- [ ] `rotateKeyPlan()` documents key rotation procedure

## End-to-End Test Plan

1. User signs up via `/signup`
2. User subscribes to a plan via `/billing`
3. Stripe webhook activates subscription (`checkout.session.completed`)
4. User creates bot via `/dashboard`
5. Bot status transitions: `provisioning` -> `running`
6. User opens control panel (proxied to bot gateway via `/bot/panel/*`)
7. User configures bot (model provider, API key, system instructions)
8. User restarts bot via dashboard
9. Rapid restart is throttled (1 minute cooldown)
10. User cancels subscription via Stripe
11. Stripe webhook marks subscription `canceled`
12. Bot enters grace period (subscription `past_due`)
13. After grace period: bot suspended (stopped, data retained)
14. After retention window: bot destroyed (all resources cleaned up)
15. Cross-tenant: second user cannot see/control first user's bot
16. Log output verified to not contain any sentinel secret values

## Operational Commands

```bash
# Start local development services
docker compose up -d

# Run database migrations
pnpm --filter api prisma migrate dev

# Seed test data
pnpm --filter api prisma:seed

# Start API development server
pnpm --filter api dev

# Start web development server
pnpm --filter web dev

# Run all tests
pnpm test

# Provision a staging bot
DIGITALOCEAN_TOKEN=xxx tsx scripts/staging_provision_one.ts

# Destroy a staging bot
DIGITALOCEAN_TOKEN=xxx tsx scripts/staging_destroy_one.ts <instanceId> [volumeId]

# Find orphaned resources (dry run)
DATABASE_URL=xxx DIGITALOCEAN_TOKEN=xxx tsx scripts/cleanup_orphans.ts --dry-run

# Clean up orphans
DATABASE_URL=xxx DIGITALOCEAN_TOKEN=xxx tsx scripts/cleanup_orphans.ts

# Print rendered runtime templates (dry run)
tsx packages/runtime/src/dry-run.ts
```

## Runbook: Incident Response

### Bot Stuck in Provisioning
1. Check `bot_events` table for the bot
2. Check `jobs` table for failed PROVISION_BOT jobs
3. Check DigitalOcean console for droplet status
4. If orphaned, use `cleanup_orphans.ts --dry-run` to identify
5. Manually update bot status or trigger re-provision

### Orphaned Resources
1. Run `tsx scripts/cleanup_orphans.ts --dry-run` to identify
2. Review output to confirm resources are truly orphaned
3. Run `tsx scripts/cleanup_orphans.ts` to destroy

### Kill Switch (Emergency Proxy Shutdown)
1. The proxy module exports `activateKillSwitch()` / `deactivateKillSwitch()`
2. When activated, all proxy requests return 403 immediately
3. Use for emergency isolation when a bot is compromised

### Key Rotation
1. Call `rotateKeyPlan()` from `@managed-bot/shared` for procedure
2. Summary: decrypt all `bot_secrets` with old key, re-encrypt with new key, atomic DB update
3. Update `SECRETS_MASTER_KEY` in environment after migration
