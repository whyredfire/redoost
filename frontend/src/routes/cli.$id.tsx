import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, Terminal } from "lucide-react";
import { useState } from "react";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { approveCliLogin, signedInUser } from "@/lib/auth";
import { ApiError } from "@/lib/deploy";
import { useToken } from "@/lib/session";

// Opened from the link `redoost login` prints
export const Route = createFileRoute("/cli/$id")({
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
      <SignInPrompt
        title="Sign in to continue"
        description="Then you can sign in to the redoost CLI."
      />
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
        <CircleCheck className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">You're signed in</h1>
        <p className="text-sm text-muted-foreground">
          The CLI finishes signing in by itself. You can close this tab.
        </p>
      </div>
    );
  }

  const email = signedInUser()?.email;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <Terminal className="size-8 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Sign in to the redoost CLI?</h1>
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
