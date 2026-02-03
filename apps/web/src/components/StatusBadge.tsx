import { cn } from "@/lib/cn";

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  provisioning: { bg: "bg-primary-50", text: "text-primary-700", dot: "bg-primary-500" },
  initializing: { bg: "bg-primary-50", text: "text-primary-700", dot: "bg-primary-500" },
  running: { bg: "bg-success-50", text: "text-success-700", dot: "bg-success-500" },
  stopped: { bg: "bg-neutral-100", text: "text-neutral-600", dot: "bg-neutral-400" },
  error: { bg: "bg-error-50", text: "text-error-700", dot: "bg-error-500" },
  destroying: { bg: "bg-warning-50", text: "text-warning-700", dot: "bg-warning-500" },
  destroyed: { bg: "bg-neutral-100", text: "text-neutral-500", dot: "bg-neutral-300" },
};

const pulsingStatuses = new Set(["provisioning", "initializing", "destroying"]);

export interface StatusBadgeProps {
  status: string;
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.error;
  const isPulsing = pulsingStatuses.has(status);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        "transition-all duration-500 ease-in-out",
        config.bg,
        config.text,
      )}
    >
      <span className="relative flex h-2 w-2">
        {isPulsing && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              "animate-ping",
              config.dot,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            "transition-colors duration-500 ease-in-out",
            config.dot,
          )}
        />
      </span>
      <span className="transition-opacity duration-300 ease-in-out">{label}</span>
    </span>
  );
}
