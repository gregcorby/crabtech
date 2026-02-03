export type BotStatus =
  | "provisioning"
  | "initializing"
  | "running"
  | "stopped"
  | "error"
  | "destroying"
  | "destroyed";

export type SubscriptionStatus =
  | "inactive"
  | "active"
  | "past_due"
  | "canceled"
  | "suspended";

export type JobType =
  | "PROVISION_BOT"
  | "STOP_BOT"
  | "RESTART_BOT"
  | "DESTROY_BOT"
  | "HEALTH_POLL"
  | "SUSPEND_BOT"
  | "RESUME_BOT"
  | "DESTROY_BOT_SUBSCRIPTION_ENDED";

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retrying";

export type CloudProvider = "digitalocean" | "fake";

export interface UserPublic {
  id: string;
  email: string;
  createdAt: string;
}

export interface BotPublic {
  id: string;
  name: string;
  status: BotStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BotSecretPublic {
  key: string;
  present: boolean;
}

export interface BotEventPublic {
  id: string;
  type: string;
  payloadJson: string | null;
  createdAt: string;
}

export interface SubscriptionPublic {
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}
