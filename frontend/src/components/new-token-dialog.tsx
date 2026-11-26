import { errorMessage, scopes } from "@redoost/shared";
import type { CreatedToken, Scope } from "@redoost/shared";
import { For, Show, createSignal } from "solid-js";

import { CopyButton } from "@/components/copy-button";
import { ExpirySelect } from "@/components/expiry-select";
import { Plus } from "@/components/icons";
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
import { api } from "@/lib/api";
import { loadToken } from "@/lib/session";
import { scopeDetails } from "@/lib/tokens";

interface NewTokenDialogProps {
  onCreated: () => Promise<void>;
}

export const NewTokenDialog = (props: NewTokenDialogProps) => {
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [chosen, setChosen] = createSignal<Scope[]>(["read", "publish"]);
  const [expiresAt, setExpiresAt] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [created, setCreated] = createSignal<CreatedToken | null>(null);
  const [error, setError] = createSignal("");

  const changeOpen = (next: boolean) => {
    if (creating()) {
      return;
    }

    setOpen(next);

    if (!next) {
      setName("");
      setChosen(["read", "publish"]);
      setExpiresAt(null);
      setCreated(null);
      setError("");
    }
  };

  const toggle = (scope: Scope) => {
    setChosen((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : scopes.filter((entry) => entry === scope || current.includes(entry))
    );
  };

  const create = async (event: SubmitEvent) => {
    event.preventDefault();
    const token = loadToken();

    if (!token) {
      return;
    }

    setCreating(true);
    setError("");

    try {
      const made = await api(token).createToken({
        name: name(),
        scopes: chosen(),
        expires_at: expiresAt(),
      });

      await props.onCreated();
      setCreated(made);
    } catch (error_) {
      setError(errorMessage(error_));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open()} onOpenChange={changeOpen}>
      <DialogTrigger as={Button}>
        <Plus />
        New token
      </DialogTrigger>
      <DialogContent>
        <Show
          when={created()}
          fallback={
            <form onSubmit={create} class="space-y-6">
              <DialogHeader>
                <DialogTitle>New token</DialogTitle>
                <DialogDescription>
                  For publishing from a pipeline or another machine, without
                  signing in.
                </DialogDescription>
              </DialogHeader>
              <div class="space-y-2">
                <label for="token-name" class="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="token-name"
                  value={name()}
                  onInput={(event: { currentTarget: HTMLInputElement }) =>
                    setName(event.currentTarget.value)
                  }
                  placeholder="What it's for, like GitHub Actions"
                  maxlength={100}
                  required
                  autofocus
                  disabled={creating()}
                />
              </div>
              <fieldset class="space-y-2" disabled={creating()}>
                <legend class="mb-2 text-sm font-medium">What it can do</legend>
                <div class="bg-card shadow-raised divide-y rounded-xl">
                  <For each={scopes}>
                    {(scope) => (
                      <label class="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm">
                        <input
                          type="checkbox"
                          class="accent-brand mt-1"
                          checked={chosen().includes(scope)}
                          onChange={() => toggle(scope)}
                        />
                        <span>
                          <span class="font-medium">
                            {scopeDetails[scope].label}
                          </span>
                          <span class="text-muted-foreground block">
                            {scopeDetails[scope].description}
                          </span>
                        </span>
                      </label>
                    )}
                  </For>
                </div>
              </fieldset>
              <div class="space-y-2">
                <p class="text-sm font-medium">Expiry</p>
                <ExpirySelect
                  label="Expiry"
                  value={expiresAt()}
                  onChange={(value: string | null) => setExpiresAt(value)}
                  disabled={creating()}
                />
              </div>
              <Show when={error()}>
                <p role="alert" class="text-destructive text-sm">
                  {error()}
                </p>
              </Show>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={
                    creating() || !name().trim() || chosen().length === 0
                  }
                >
                  {creating() ? "Creating…" : "Create token"}
                </Button>
              </DialogFooter>
            </form>
          }
        >
          {(made) => (
            <>
              <DialogHeader>
                <DialogTitle>{made().name}</DialogTitle>
                <DialogDescription>
                  Copy it now. It won't be shown again.
                </DialogDescription>
              </DialogHeader>
              <div class="bg-muted/40 flex items-center gap-2 rounded-lg border py-1.5 pr-1.5 pl-4">
                <span class="min-w-0 flex-1 truncate font-mono text-sm">
                  {made().token}
                </span>
                <CopyButton
                  text={made().token}
                  label="Copy token"
                  hint="Copy token"
                />
              </div>
              <p class="text-muted-foreground text-sm">
                Set it as <span class="font-mono">REDOOST_TOKEN</span> where the
                CLI runs, or sign in with{" "}
                <span class="font-mono">redoost login --token</span>.
              </p>
              <DialogFooter>
                <Button type="button" onClick={() => changeOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </Show>
      </DialogContent>
    </Dialog>
  );
};
