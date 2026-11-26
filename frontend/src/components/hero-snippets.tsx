import type { JSX } from "@solidjs/web";

import claude from "@/assets/agents/claude.svg";
import { Check, History } from "@/components/icons";
import { LiveDot } from "@/components/live-dot";
import { cn } from "@/lib/cn";

const Snippet = (props: { class: string; children: JSX.Element }) => (
  <div
    class={cn(
      "bg-card/90 shadow-float motion-safe:animate-float absolute w-60 rounded-xl p-4 text-left backdrop-blur",
      props.class
    )}
  >
    {props.children}
  </div>
);

export const HeroSnippets = () => (
  <div aria-hidden="true" class="pointer-events-none hidden xl:block">
    <Snippet class="top-[16%] left-[3%] -rotate-3">
      <p class="flex items-center gap-2 font-mono text-sm">
        <LiveDot pulse />
        swift-finch-5e21
      </p>
      <p class="text-muted-foreground mt-1.5 text-xs">
        4 files · 38 KiB · just now
      </p>
    </Snippet>
    <Snippet class="top-[62%] left-[6%] rotate-2 [animation-delay:-2s]">
      <p class="flex justify-between text-xs">
        <span class="font-medium">Uploading</span>
        <span class="text-muted-foreground font-mono">9 / 12 files</span>
      </p>
      <div class="bg-muted mt-2.5 h-1.5 overflow-hidden rounded-full">
        <div class="bg-brand relative h-full w-3/4 overflow-hidden rounded-full">
          <span class="motion-safe:animate-shimmer absolute inset-0 bg-linear-to-r from-transparent via-white/40 to-transparent" />
        </div>
      </div>
    </Snippet>
    <Snippet class="top-[18%] right-[3%] rotate-3 [animation-delay:-4s]">
      <p class="text-muted-foreground flex items-center gap-2 text-xs">
        <img src={claude} alt="" class="size-3.5" />
        Claude Code
      </p>
      <p class="mt-2 font-mono text-xs">
        <span class="text-brand select-none">$ </span>redoost publish ./dist
      </p>
      <p class="text-muted-foreground mt-1 flex items-center gap-1.5 font-mono text-xs">
        <Check class="text-brand size-3" />
        Published quiet-heron-7f3c
      </p>
    </Snippet>
    <Snippet class="top-[60%] right-[6%] -rotate-2 [animation-delay:-1s]">
      <p class="flex items-center gap-2 text-sm font-medium">
        <History class="text-muted-foreground size-4" />
        Version 3 is live
      </p>
      <p class="text-muted-foreground mt-1.5 text-xs">
        Fixed the nav · 2 min ago
      </p>
    </Snippet>
  </div>
);
