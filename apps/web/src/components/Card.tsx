import { cn } from "@/lib/cn";

const paddingStyles = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
} as const;

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: keyof typeof paddingStyles;
}

export function Card({ children, className, padding = "md" }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-neutral-200 bg-white shadow-card",
        paddingStyles[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}
