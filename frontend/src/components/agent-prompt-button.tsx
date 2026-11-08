import { Bot, Check } from "lucide-react";
import { AgentLogos } from "@/components/agent-logos";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@cloudflare/kumo/components/tooltip";
import { useCopy } from "@/lib/clipboard";

// The prompt only points at the setup steps, which agents fetch and follow
export function AgentPromptButton() {
  const { copied, copy } = useCopy();

  return (
    <Tooltip content="Copied" open={copied} asChild>
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground"
        aria-label={copied ? "Copied" : "Copy a prompt that sets up your agent"}
        onClick={() =>
          copy(
            `Fetch and follow the instructions to set me up for redoost from ${location.origin}/agent-setup.md`,
          )
        }
      >
        {copied ? (
          <Check className="sm:hidden" />
        ) : (
          <Bot className="sm:hidden" />
        )}
        <span className="hidden sm:inline">Set up your agent</span>
        <AgentLogos className="hidden sm:flex" />
      </Button>
    </Tooltip>
  );
}
