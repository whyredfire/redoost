import { createSignal } from "solid-js";

import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/cn";
import { config } from "@/lib/config";
import { inset } from "@/lib/layout";

const installs = {
  npm: "npm i -g redoost",
  bun: "bun add -g redoost",
};

type Manager = keyof typeof installs;

const managers: Manager[] = ["npm", "bun"];

const Prompt = () => <span class="text-brand select-none">$ </span>;

export const TerminalSection = () => {
  const [manager, setManager] = createSignal<Manager>("npm");

  const commands = () => [
    installs[manager()],
    "redoost login",
    "redoost publish ./dist",
  ];

  const origin = config.sitesOrigin ? new URL(config.sitesOrigin) : null;

  return (
    <section
      class={cn(
        inset,
        "grid items-center gap-8 border-t py-14 md:grid-cols-2 md:gap-12"
      )}
    >
      <div class="space-y-3">
        <h2 class="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Or publish from the terminal.
        </h2>
        <p class="text-muted-foreground max-w-md text-balance">
          The same uploads, from a script, CI, or your coding agent. The CLI
          needs Node.js 20 or later.
        </p>
      </div>
      <div class="bg-card shadow-raised min-w-0 overflow-hidden rounded-xl">
        <div class="flex items-center gap-1 border-b py-1.5 pr-1.5 pl-2">
          {managers.map((name) => (
            <button
              type="button"
              aria-pressed={manager() === name ? "true" : "false"}
              onClick={() => setManager(name)}
              class={cn(
                "rounded-md px-2 py-1 font-mono text-xs transition-colors",
                manager() === name
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {name}
            </button>
          ))}
          <div class="ml-auto">
            <CopyButton
              text={commands().join("\n")}
              label="Copy the commands"
              hint="Copy commands"
              size="icon-xs"
            />
          </div>
        </div>
        <div class="space-y-1.5 overflow-x-auto px-4 py-4 font-mono text-sm whitespace-nowrap">
          <p>
            <Prompt />
            {commands()[0]}
          </p>
          <p>
            <Prompt />
            redoost login
          </p>
          <p>
            <Prompt />
            redoost publish ./dist
          </p>
          <p class="text-muted-foreground">
            Published{" "}
            <span class="hidden sm:inline">
              {origin ? `${origin.protocol}//` : ""}
            </span>
            <span class="text-foreground">brave-otter-1a2b</span>
            {origin ? `.${origin.host}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
};
