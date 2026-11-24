import { Show } from "solid-js";
import { CopyButton } from "@/components/copy-button";
import { installUrl } from "@/lib/config";

type CliCommandProps = {
  command?: string;
  variant?: "box" | "compact" | "plain";
};

export function CliCommand(props: CliCommandProps) {
  const command = () => props.command ?? "redoost publish ./dist";
  const variant = () => props.variant ?? "box";

  return (
    <Show
      when={variant() !== "plain"}
      fallback={
        <p class="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span>
            <span class="text-brand select-none">$ </span>
            <span class="text-foreground">{command()}</span>
          </span>
          <CopyButton
            text={command()}
            label="Copy the CLI command"
            hint="Copy command"
            size="icon-xs"
          />
          <a
            href={installUrl}
            target="_blank"
            rel="noreferrer"
            class="font-sans underline-offset-4 hover:text-foreground hover:underline"
          >
            Install the CLI
          </a>
        </p>
      }
    >
      <div class="flex items-center gap-3 rounded-xl border bg-muted/40 py-1.5 pr-1.5 pl-4 font-mono text-sm">
        <span class="min-w-0 flex-1 truncate">
          <span class="text-brand select-none">$ </span>
          {command()}
        </span>
        <Show when={variant() === "box"}>
          <a
            href={installUrl}
            target="_blank"
            rel="noreferrer"
            class="hidden shrink-0 font-sans text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:inline"
          >
            Install the CLI
          </a>
        </Show>
        <CopyButton
          text={command()}
          label="Copy the CLI command"
          hint="Copy command"
        />
      </div>
    </Show>
  );
}
