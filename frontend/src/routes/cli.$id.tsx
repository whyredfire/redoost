import { ApiError, errorMessage } from "@redoost/shared";
import { createFileRoute } from "@tanstack/solid-router";
import { Show, createSignal } from "solid-js";

import { CircleCheck } from "@/components/icons";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { signedInUser } from "@/lib/auth";
import { useToken } from "@/lib/session";

const LoginCommand = () => (
  <p class="bg-muted/40 rounded-lg border px-3 py-1.5 font-mono text-sm">
    <span class="text-brand select-none">$ </span>redoost login
  </p>
);

const CliLoginPage = () => {
  const params = Route.useParams();
  const token = useToken();
  const [approving, setApproving] = createSignal(false);
  const [approved, setApproved] = createSignal(false);
  const [error, setError] = createSignal("");

  const approve = async () => {
    const current = token();

    if (!current) {
      return;
    }

    setApproving(true);
    setError("");

    try {
      await api(current).approveCliLogin(params().id);
      setApproved(true);
    } catch (error_) {
      if (error_ instanceof ApiError && error_.status === 404) {
        setError("This sign-in link has expired or was already used.");
      } else {
        setError(errorMessage(error_));
      }
    } finally {
      setApproving(false);
    }
  };

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
            <p class="text-muted-foreground text-sm">
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
          <p class="text-muted-foreground text-sm">
            The CLI will act as{" "}
            <span class="text-foreground font-medium">
              {signedInUser()?.email ?? "your account"}
            </span>
            . Only continue if you just ran{" "}
            <code class="font-mono">redoost login</code> yourself.
          </p>
          <Button class="mt-3" disabled={approving()} onClick={approve}>
            {approving() ? "Signing in…" : "Continue"}
          </Button>
          <Show when={error()}>
            <p role="alert" class="text-destructive text-sm">
              {error()}
            </p>
          </Show>
        </div>
      </Show>
    </Show>
  );
};

export const Route = createFileRoute("/cli/$id")({
  head: () => ({ meta: [{ title: "Sign in to the CLI · redoost" }] }),
  component: CliLoginPage,
});
