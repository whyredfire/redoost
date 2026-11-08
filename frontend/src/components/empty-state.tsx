import { Empty } from "@cloudflare/kumo/components/empty";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  children,
}: EmptyStateProps) {
  return (
    <Empty
      icon={<Icon className="size-6 text-muted-foreground" />}
      title={title}
      description={description}
      contents={children}
      className={cn("rounded-xl border", className)}
    />
  );
}
