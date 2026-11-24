import { createFileRoute } from "@tanstack/solid-router";
import { Show, createSignal } from "solid-js";
import { CircleCheck } from "@/components/icons";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { approveCliLogin, signedInUser } from "@/lib/auth";
import { errorMessage } from "@/lib/format";
import { useToken } from "@/lib/session";

// Opened from the link `redoost login` prints
export const Route = createFileRoute("/cli/$id")({
  head: () => ({ meta: [{ title: "Sign in to the CLI · redoost" }] }),
  component: CliLoginPage,
});

function CliLoginPage() {
  const params = Route.useParams();
  const token = useToken();
  const [approving, setApproving] = createSignal(false);
  const [approved, setApproved] = createSignal(false);
  const [error, setError] = createSignal("");

  async function approve() {
    const current = token();
    if (!current) return;
    setApproving(true);
    setError("");
    try {
      await approveCliLogin(params().id, current);
      setApproved(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setError("This sign-in link has expired or was already used.");
      } else {
        setError(errorMessage(cause));
      }
    } finally {
      setApproving(false);
    }
  }

  return (
    <Show
      when={token()}
      fallback={
        <div class="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
          <LoginCommand />
          <h1 class="mt-3 mb-3 text-2xl font-semibold tracking-tighter">
            Sign in to the redoost CLI
          </h1>
          <SignInPrompt
            class="w-full"
            title="Sign in to continue"
            description="Then you can let the CLI act as your account."
          />
        </div>
      }
    >
      <Show
        when={!approved()}
        fallback={
          <div class="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
            <CircleCheck class="size-8 text-emerald-600 dark:text-emerald-500" />
            <h1 class="text-2xl font-semibold tracking-tighter">
              You're signed in
            </h1>
            <p class="text-sm text-muted-foreground">
              The CLI finishes signing in by itself. You can close this tab.
            </p>
          </div>
        }
      >
        <div class="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
          <LoginCommand />
          <h1 class="mt-3 text-2xl font-semibold tracking-tighter">
            Sign in to the redoost CLI?
          </h1>
          <p class="text-sm text-muted-foreground">
            The CLI will act as{" "}
            <span class="font-medium text-foreground">
              {signedInUser()?.email ?? "your account"}
            </span>
            . Only continue if you just ran{" "}
            <code class="font-mono">redoost login</code> yourself.
          </p>
          <Button class="mt-3" disabled={approving()} onClick={approve}>
            {approving() ? "Signing in…" : "Continue"}
          </Button>
          <Show when={error()}>
            <p role="alert" class="text-sm text-destructive">
              {error()}
            </p>
          </Show>
        </div>
      </Show>
    </Show>
  );
}

function LoginCommand() {
  return (
    <p class="rounded-lg border bg-muted/40 px-3 py-1.5 font-mono text-sm">
      <span class="text-brand select-none">$ </span>redoost login
    </p>
  );
}
