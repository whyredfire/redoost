import { Show } from "solid-js";
import { AgentLogos } from "@/components/agent-logos";
import { Bot, Check } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCopy } from "@/lib/clipboard";

// The prompt only points at the setup steps, which agents fetch and follow
export function AgentPromptButton() {
  const { copied, copy } = useCopy();

  return (
    <Tooltip open={copied()}>
      <TooltipTrigger
        as={Button}
        type="button"
        variant="ghost"
        class="text-muted-foreground"
        aria-label={
          copied() ? "Copied" : "Copy a prompt that sets up your agent"
        }
        onClick={() =>
          copy(
            `Fetch and follow the instructions to set me up for redoost from ${location.origin}/agent-setup.md`,
          )
        }
      >
        <Show when={copied()} fallback={<Bot class="sm:hidden" />}>
          <Check class="sm:hidden" />
        </Show>
        <span class="hidden sm:inline">Set up your agent</span>
        <AgentLogos class="hidden sm:flex" />
      </TooltipTrigger>
      <TooltipContent>Copied</TooltipContent>
    </Tooltip>
  );
}
