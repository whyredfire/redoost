import { cn } from "cn";

type LiveDotProps = { pulse?: boolean; off?: boolean; className?: string };

export function LiveDot({
  pulse = false,
  off = false,
  className,
}: LiveDotProps) {
  return (
    <span
      aria-hidden
      className={cn("relative flex size-2 shrink-0", className)}
    >
      {pulse && (
        <span className="absolute size-full rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
      )}
      <span
        className={cn(
          "relative size-2 rounded-full",
          off ? "bg-muted-foreground/40" : "bg-brand",
        )}
      />
    </span>
  );
}
