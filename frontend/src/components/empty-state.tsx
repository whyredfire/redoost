import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

function EmptyStateIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
      <Icon className="size-5 text-muted-foreground" />
    </div>
  );
}

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
};

export function EmptyState({
  icon,
  title,
  description,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border px-6 py-12 text-center",
        className,
      )}
    >
      <EmptyStateIcon icon={icon} />
      <p className="text-lg font-medium">{title}</p>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
