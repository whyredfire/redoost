import { errorMessage } from "@redoost/shared";
import { Link, useRouter } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";

import { EmptyState } from "@/components/empty-state";
import { LogIn } from "@/components/icons";
import { ProviderLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
import { authConfig, providerNames, signIn, signInAsDev } from "@/lib/auth";
import { cn } from "@/lib/cn";

interface SignInPromptProps {
  title: string;
  description: string;
  class?: string;
}

export const SignInButton = () => {
  const router = useRouter();
  const [error, setError] = createSignal("");
  const { oidc } = authConfig;

  const signInLocally = async () => {
    setError("");

    try {
      await signInAsDev();
      await router.invalidate();
    } catch (error_) {
      setError(errorMessage(error_));
    }
  };

  return (
    <div class="flex flex-col items-center">
      {oidc ? (
        <Button onClick={() => signIn()}>
          <ProviderLogo provider={oidc.provider} />
          Sign in with {providerNames[oidc.provider]}
        </Button>
      ) : (
        <Button onClick={signInLocally}>Sign in as dev user</Button>
      )}
      <p class="text-muted-foreground mt-4 max-w-xs text-xs text-balance">
        By signing in, you agree to the{" "}
        <Link
          to="/terms"
          class="hover:text-foreground underline underline-offset-4"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          to="/privacy"
          class="hover:text-foreground underline underline-offset-4"
        >
          Privacy Policy
        </Link>
        .
      </p>
      <Show when={error()}>
        <p role="alert" class="text-destructive mt-3 text-sm">
          {error()}
        </p>
      </Show>
    </div>
  );
};

export const SignInPrompt = (props: SignInPromptProps) => {
  const { oidc, dev } = authConfig;

  if (!oidc && !dev) {
    return null;
  }

  return (
    <EmptyState
      icon={LogIn}
      title={props.title}
      description={props.description}
      class={cn("justify-center", props.class)}
    >
      <SignInButton />
    </EmptyState>
  );
};
