import { cn } from "cn";
import { LiveDot } from "@/components/live-dot";
import { RotatingWord } from "@/components/rotating-word";
import { config } from "@/lib/config";

// Equally long, so the domain after them stays put
const slugs = [
  "brave-otter-1a2b",
  "quiet-heron-7f3c",
  "swift-finch-5e21",
  "amber-koala-09ad",
];

export function AddressPreview({ className }: { className?: string }) {
  const origin = config.sitesOrigin ? new URL(config.sitesOrigin) : null;

  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center gap-3 overflow-hidden rounded-xl border bg-card px-4 py-3.5 font-mono text-sm whitespace-nowrap shadow-xs sm:text-base",
        className,
      )}
    >
      <LiveDot pulse />
      <span className="min-w-0 truncate">
        <span className="hidden text-muted-foreground sm:inline">
          {origin ? `${origin.protocol}//` : ""}
        </span>
        <RotatingWord words={slugs} />
        {origin && (
          <span className="text-muted-foreground">.{origin.host}</span>
        )}
      </span>
    </div>
  );
}
