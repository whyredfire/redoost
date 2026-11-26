import { errorMessage } from "@redoost/shared";
import { createSignal, Match, Switch } from "solid-js";

import { Hint } from "@/components/hint";
import { Pencil } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

interface SiteDescriptionProps {
  description: string;
  onSave: (description: string) => Promise<void>;
  placeholder?: string;
  compact?: boolean;
}

export const SiteDescription = (props: SiteDescriptionProps) => {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const placeholder = () => props.placeholder ?? "What's this site for?";

  const edit = () => {
    setDraft(props.description);
    setError("");
    setEditing(true);
  };

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await props.onSave(draft().trim());
      setEditing(false);
    } catch (error_) {
      setError(errorMessage(error_));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Switch>
      <Match when={editing()}>
        <form
          onSubmit={save}
          class={cn("space-y-2", props.compact && "my-1.5")}
        >
          <div class="flex gap-2">
            <Input
              aria-label="Description"
              value={draft()}
              onInput={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setEditing(false);
                }
              }}
              placeholder={placeholder()}
              maxlength={200}
              disabled={saving()}
              // WARNING: autofocus only applies on page load, not to inserted inputs
              ref={(input) => requestAnimationFrame(() => input.focus())}
              class={cn("min-w-0 flex-1", props.compact && "h-8")}
            />
            <Button
              type="submit"
              size={props.compact ? "sm" : "default"}
              disabled={saving()}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size={props.compact ? "sm" : "default"}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
          {error() && (
            <p role="alert" class="text-destructive text-sm">
              {error()}
            </p>
          )}
        </form>
      </Match>
      <Match when={!props.description && props.compact}>
        <button
          type="button"
          class="text-muted-foreground/60 hover:text-foreground text-sm transition-colors"
          onClick={edit}
        >
          {placeholder()}
        </button>
      </Match>
      <Match when={!props.description}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="text-muted-foreground -ml-2.5"
          onClick={edit}
        >
          <Pencil />
          Add a description
        </Button>
      </Match>
      <Match when={true}>
        <div class="flex items-start gap-1.5">
          <p class="text-muted-foreground min-w-0 break-words">
            {props.description}
          </p>
          <Hint label="Edit description">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Edit description"
              onClick={edit}
            >
              <Pencil />
            </Button>
          </Hint>
        </div>
      </Match>
    </Switch>
  );
};
