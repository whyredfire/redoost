import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { approveCliLogin, signedInUser } from "@/lib/auth";
import { ApiError } from "@/lib/deploy";
import { useToken } from "@/lib/session";

// Opened from the link `redoost login` prints
export const Route = createFileRoute("/cli/$id")({
  head: () => ({ meta: [{ title: "Sign in to the CLI · redoost" }] }),
  component: CliLoginPage,
});

function CliLoginPage() {
  const { id } = Route.useParams();
  const token = useToken();
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");

  if (!token) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <LoginCommand />
        <h1 className="mt-3 mb-3 text-2xl font-semibold tracking-tighter">
          Sign in to the redoost CLI
        </h1>
        <SignInPrompt
          className="w-full"
          title="Sign in to continue"
          description="Then you can let the CLI act as your account."
        />
      </div>
    );
  }

  async function approve() {
    setApproving(true);
    setError("");
    try {
      await approveCliLogin(id);
      setApproved(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setError("This sign-in link has expired or was already used.");
      } else {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      setApproving(false);
    }
  }

  if (approved) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <CircleCheck className="size-8 text-emerald-600 dark:text-emerald-500" />
        <h1 className="text-2xl font-semibold tracking-tighter">
          You're signed in
        </h1>
        <p className="text-sm text-muted-foreground">
          The CLI finishes signing in by itself. You can close this tab.
        </p>
      </div>
    );
  }

  const email = signedInUser()?.email;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <LoginCommand />
      <h1 className="mt-3 text-2xl font-semibold tracking-tighter">
        Sign in to the redoost CLI?
      </h1>
      <p className="text-sm text-muted-foreground">
        The CLI will act as{" "}
        <span className="font-medium text-foreground">
          {email ?? "your account"}
        </span>
        . Only continue if you just ran{" "}
        <code className="font-mono">redoost login</code> yourself.
      </p>
      <Button className="mt-3" disabled={approving} onClick={approve}>
        {approving ? "Signing in…" : "Continue"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function LoginCommand() {
  return (
    <p className="rounded-lg border bg-muted/40 px-3 py-1.5 font-mono text-sm">
      <span className="text-brand select-none">$ </span>redoost login
    </p>
  );
}
