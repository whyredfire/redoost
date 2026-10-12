import { CopyButton } from "@/components/copy-button";
import { repository } from "@/lib/config";

const installUrl = `${repository}/tree/main/cli#readme`;

type CliCommandProps = {
  command?: string;
  variant?: "box" | "compact" | "plain";
};

export function CliCommand({
  command = "redoost publish ./dist",
  variant = "box",
}: CliCommandProps) {
  if (variant === "plain") {
    return (
      <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span>
          <span className="text-brand select-none">$ </span>
          <span className="text-foreground">{command}</span>
        </span>
        <CopyButton
          text={command}
          label="Copy the CLI command"
          hint="Copy command"
          size="icon-xs"
        />
        <a
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          className="font-sans underline-offset-4 hover:text-foreground hover:underline"
        >
          Install the CLI
        </a>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/40 py-1.5 pr-1.5 pl-4 font-mono text-sm">
      <span className="min-w-0 flex-1 truncate">
        <span className="text-brand select-none">$ </span>
        {command}
      </span>
      {variant === "box" && (
        <a
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden shrink-0 font-sans text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:inline"
        >
          Install the CLI
        </a>
      )}
      <CopyButton
        text={command}
        label="Copy the CLI command"
        hint="Copy command"
      />
    </div>
  );
}
