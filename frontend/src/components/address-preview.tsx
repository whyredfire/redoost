import { cn } from "cn";

import { LiveDot } from "@/components/live-dot";
import { RotatingWord } from "@/components/rotating-word";
import { config } from "@/lib/config";

const slugs = [
  "brave-otter-1a2b",
  "quiet-heron-7f3c",
  "swift-finch-5e21",
  "amber-koala-09ad",
];

export const AddressPreview = (props: { class?: string }) => {
  const origin = config.sitesOrigin ? new URL(config.sitesOrigin) : null;

  return (
    <div
      aria-hidden="true"
      class={cn(
        "bg-card shadow-raised flex items-center gap-3 overflow-hidden rounded-xl px-4 py-3.5 font-mono text-sm whitespace-nowrap shadow-xs sm:text-base",
        props.class
      )}
    >
      <LiveDot pulse />
      <span class="min-w-0 truncate">
        <span class="text-muted-foreground hidden sm:inline">
          {origin ? `${origin.protocol}//` : ""}
        </span>
        <RotatingWord words={slugs} />
        {origin && <span class="text-muted-foreground">.{origin.host}</span>}
      </span>
    </div>
  );
};
