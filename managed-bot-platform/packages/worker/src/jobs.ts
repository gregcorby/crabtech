import type { JobType } from "@managed-bot/shared";

export interface JobData {
  botId: string;
  userId: string;
  type: JobType;
  metadata?: Record<string, unknown>;
}

export interface ProvisionJobData extends JobData {
  type: "PROVISION_BOT";
  region: string;
  size: string;
}

export interface StopJobData extends JobData {
  type: "STOP_BOT";
  instanceId: string;
}

export interface RestartJobData extends JobData {
  type: "RESTART_BOT";
  instanceId: string;
}

export interface DestroyJobData extends JobData {
  type: "DESTROY_BOT";
  instanceId: string;
  volumeId: string | null;
}

export interface HealthPollJobData extends JobData {
  type: "HEALTH_POLL";
  instanceId: string;
}

export interface SuspendJobData extends JobData {
  type: "SUSPEND_BOT";
  instanceId: string;
}

export interface ResumeJobData extends JobData {
  type: "RESUME_BOT";
  instanceId: string;
}

export interface DestroyBotSubscriptionEndedJobData extends JobData {
  type: "DESTROY_BOT_SUBSCRIPTION_ENDED";
  instanceId: string;
  volumeId: string | null;
}

export type AnyJobData =
  | ProvisionJobData
  | StopJobData
  | RestartJobData
  | DestroyJobData
  | HealthPollJobData
  | SuspendJobData
  | ResumeJobData
  | DestroyBotSubscriptionEndedJobData;

export const JOB_QUEUE_NAME = "bot-jobs";

export const RETRY_CONFIG: Record<string, { maxAttempts: number; backoffMs: number }> = {
  PROVISION_BOT: { maxAttempts: 3, backoffMs: 5000 },
  STOP_BOT: { maxAttempts: 3, backoffMs: 2000 },
  RESTART_BOT: { maxAttempts: 3, backoffMs: 2000 },
  DESTROY_BOT: { maxAttempts: 5, backoffMs: 5000 },
  HEALTH_POLL: { maxAttempts: 1, backoffMs: 0 },
  SUSPEND_BOT: { maxAttempts: 3, backoffMs: 2000 },
  RESUME_BOT: { maxAttempts: 3, backoffMs: 5000 },
  DESTROY_BOT_SUBSCRIPTION_ENDED: { maxAttempts: 5, backoffMs: 5000 },
};
