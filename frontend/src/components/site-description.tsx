import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SiteDescriptionProps = {
  description: string;
  onSave: (description: string) => Promise<void>;
};

export function SiteDescription({ description, onSave }: SiteDescriptionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function edit() {
    setDraft(description);
    setError("");
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-2">
        <div className="flex gap-2">
          <Input
            aria-label="Description"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditing(false);
            }}
            placeholder="What's this site for?"
            maxLength={200}
            disabled={saving}
            autoFocus
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={saving}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    );
  }

  if (!description) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2.5 text-muted-foreground"
        onClick={edit}
      >
        <Pencil />
        Add a description
      </Button>
    );
  }

  return (
    <div className="flex items-start gap-1.5">
      <p className="min-w-0 break-words text-muted-foreground">{description}</p>
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
  );
}
