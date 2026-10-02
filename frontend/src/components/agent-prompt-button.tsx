import { Bot, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import llmsTxt from "../../public/llms.txt?raw";

type CopyState = "idle" | "copied" | "failed";

// Copies the guide itself rather than a pointer to it, so the agent has the
// publishing steps without needing to fetch anything. Inlined at build time
// from the same file that is served at /llms.txt, so the two cannot drift.
export function AgentPromptButton() {
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    let next: CopyState = "failed";

    try {
      await navigator.clipboard.writeText(llmsTxt.trim());
      next = "copied";
    } catch {
      next = "failed";
    }

    setState(next);
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="text-muted-foreground"
      aria-label={
        state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Copy failed, try again"
            : "Copy AI agent prompt to clipboard"
      }
      onClick={copy}
    >
      {state === "copied" ? <Check /> : <Bot />}
      <span className="hidden sm:inline">
        {state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Copy failed"
            : "Copy for your agent"}
      </span>
    </Button>
  );
}
