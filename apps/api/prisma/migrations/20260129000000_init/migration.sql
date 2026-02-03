-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('inactive', 'active', 'past_due', 'canceled', 'suspended');

-- CreateEnum
CREATE TYPE "bot_status" AS ENUM ('provisioning', 'initializing', 'running', 'stopped', 'error', 'destroying', 'destroyed');

-- CreateEnum
CREATE TYPE "cloud_provider" AS ENUM ('digitalocean', 'fake');

-- CreateEnum
CREATE TYPE "job_type" AS ENUM ('PROVISION_BOT', 'STOP_BOT', 'RESTART_BOT', 'DESTROY_BOT', 'HEALTH_POLL', 'SUSPEND_BOT', 'RESUME_BOT', 'DESTROY_BOT_SUBSCRIPTION_ENDED');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('pending', 'processing', 'completed', 'failed', 'retrying');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'inactive',
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "bot_status" NOT NULL DEFAULT 'provisioning',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_secrets" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_instances" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "provider" "cloud_provider" NOT NULL,
    "provider_instance_id" TEXT NOT NULL,
    "provider_volume_id" TEXT,
    "region" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_events" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "type" "job_type" NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bots_user_id_key" ON "bots"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bot_secrets_bot_id_key_key" ON "bot_secrets"("bot_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "bot_instances_bot_id_key" ON "bot_instances"("bot_id");

-- CreateIndex
CREATE INDEX "bot_events_bot_id_created_at_idx" ON "bot_events"("bot_id", "created_at");

-- CreateIndex
CREATE INDEX "jobs_status_created_at_idx" ON "jobs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_secrets" ADD CONSTRAINT "bot_secrets_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_instances" ADD CONSTRAINT "bot_instances_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_events" ADD CONSTRAINT "bot_events_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
