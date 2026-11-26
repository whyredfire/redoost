import { Show } from "solid-js";

import { Hint } from "@/components/hint";
import { Check, Copy } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/clipboard";

interface CopyButtonProps {
  text: string;
  label: string;
  hint?: string;
  size?: "icon" | "icon-xs";
}

export const CopyButton = (props: CopyButtonProps) => {
  const { copied, copy } = useCopy();

  return (
    <Hint
      label={copied() ? "Copied" : (props.hint ?? "Copy address")}
      open={copied()}
    >
      <Button
        type="button"
        variant="ghost"
        size={props.size ?? "icon"}
        aria-label={copied() ? "Copied" : props.label}
        onClick={() => copy(props.text)}
      >
        <Show when={copied()} fallback={<Copy />}>
          <Check />
        </Show>
      </Button>
    </Hint>
  );
};
