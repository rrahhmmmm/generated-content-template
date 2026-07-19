import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-sunk px-6 py-12 text-center",
        className
      )}
    >
      {Icon ? <Icon className="mb-3 size-6 text-text-subtle" /> : null}
      <p className="text-title text-text">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-body text-text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
