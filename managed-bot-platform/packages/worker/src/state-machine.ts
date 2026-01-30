import type { BotStatus, JobType } from "@managed-bot/shared";

type StatusTransition = {
  from: BotStatus[];
  to: BotStatus;
  onError: BotStatus;
};

export const JOB_TRANSITIONS: Record<string, StatusTransition> = {
  PROVISION_BOT: {
    from: ["provisioning"],
    to: "running",
    onError: "error",
  },
  STOP_BOT: {
    from: ["running", "error"],
    to: "stopped",
    onError: "error",
  },
  RESTART_BOT: {
    from: ["stopped", "running", "error"],
    to: "running",
    onError: "error",
  },
  DESTROY_BOT: {
    from: ["stopped", "running", "error", "destroying"],
    to: "destroyed",
    onError: "error",
  },
  SUSPEND_BOT: {
    from: ["running"],
    to: "stopped",
    onError: "error",
  },
  RESUME_BOT: {
    from: ["stopped"],
    to: "running",
    onError: "error",
  },
  DESTROY_BOT_SUBSCRIPTION_ENDED: {
    from: ["stopped", "error"],
    to: "destroyed",
    onError: "error",
  },
};

export function canTransition(currentStatus: BotStatus, jobType: JobType): boolean {
  const transition = JOB_TRANSITIONS[jobType];
  if (!transition) return false;
  return transition.from.includes(currentStatus);
}

export function getTargetStatus(jobType: JobType): BotStatus | null {
  return JOB_TRANSITIONS[jobType]?.to ?? null;
}

export function getErrorStatus(jobType: JobType): BotStatus {
  return JOB_TRANSITIONS[jobType]?.onError ?? "error";
}
