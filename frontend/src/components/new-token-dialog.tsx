import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExpirySelect } from "@/components/expiry-select";
import { errorMessage } from "@/lib/format";
import { loadToken } from "@/lib/session";
import {
  createToken,
  scopeDetails,
  scopes,
  type CreatedToken,
  type Scope,
} from "@/lib/tokens";

type NewTokenDialogProps = { onCreated: () => Promise<void> };

export function NewTokenDialog({ onCreated }: NewTokenDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<Scope[]>(["read", "publish"]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [error, setError] = useState("");

  function changeOpen(next: boolean) {
    if (creating) return;
    setOpen(next);
    if (!next) {
      setName("");
      setChosen(["read", "publish"]);
      setExpiresAt(null);
      setCreated(null);
      setError("");
    }
  }

  function toggle(scope: Scope) {
    setChosen((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : scopes.filter((entry) => entry === scope || current.includes(entry)),
    );
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const token = loadToken();
    if (!token) return;
    setCreating(true);
    setError("");
    try {
      const made = await createToken(
        { name, scopes: chosen, expires_at: expiresAt },
        token,
      );
      await onCreated();
      setCreated(made);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New token
        </Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{created.name}</DialogTitle>
              <DialogDescription>
                Copy it now. It won't be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pr-1.5 pl-4">
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {created.token}
              </span>
              <CopyButton
                text={created.token}
                label="Copy token"
                hint="Copy token"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Set it as <span className="font-mono">REDOOST_TOKEN</span> where
              the CLI runs, or sign in with{" "}
              <span className="font-mono">redoost login --token</span>.
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => changeOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={create} className="space-y-6">
            <DialogHeader>
              <DialogTitle>New token</DialogTitle>
              <DialogDescription>
                For publishing from a pipeline or another machine, without
                signing in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="token-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="What it's for, like GitHub Actions"
                maxLength={100}
                required
                autoFocus
                disabled={creating}
              />
            </div>
            <fieldset className="space-y-2" disabled={creating}>
              <legend className="mb-2 text-sm font-medium">
                What it can do
              </legend>
              <div className="divide-y rounded-xl bg-card shadow-raised">
                {scopes.map((scope) => (
                  <label
                    key={scope}
                    className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 accent-brand"
                      checked={chosen.includes(scope)}
                      onChange={() => toggle(scope)}
                    />
                    <span>
                      <span className="font-medium">
                        {scopeDetails[scope].label}
                      </span>
                      <span className="block text-muted-foreground">
                        {scopeDetails[scope].description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <p className="text-sm font-medium">Expiry</p>
              <ExpirySelect
                label="Expiry"
                value={expiresAt}
                onChange={setExpiresAt}
                disabled={creating}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={creating || !name.trim() || chosen.length === 0}
              >
                {creating ? "Creating…" : "Create token"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
