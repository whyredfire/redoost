import { useRouter } from "@tanstack/react-router";
import { cn } from "cn";
import { LogIn } from "lucide-react";
import { useState } from "react";
import { ProviderLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
import { authConfig, providerNames, signIn, signInAsDev } from "@/lib/auth";

type SignInPromptProps = {
  title: string;
  description: string;
  className?: string;
};

export function SignInPrompt({
  title,
  description,
  className,
}: SignInPromptProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const { oidc, dev } = authConfig;
  if (!oidc && !dev) return null;

  async function signInLocally() {
    setError("");
    try {
      await signInAsDev();
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border-2 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <LogIn className="size-5 text-muted-foreground" />
      </div>
      <p className="text-lg font-medium">{title}</p>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{description}</p>
      {oidc ? (
        <Button onClick={signIn}>
          <ProviderLogo provider={oidc.provider} />
          Sign in with {providerNames[oidc.provider]}
        </Button>
      ) : (
        <Button onClick={signInLocally}>Sign in as dev user</Button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
