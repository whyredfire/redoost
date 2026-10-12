import { cn } from "cn";

export function LiveDot({
  pulse = false,
  className,
}: {
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("relative flex size-2 shrink-0", className)}
    >
      {pulse && (
        <span className="absolute size-full rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
      )}
      <span className="relative size-2 rounded-full bg-brand" />
    </span>
  );
}
