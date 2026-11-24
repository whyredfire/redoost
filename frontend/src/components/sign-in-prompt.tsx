import { Link, useRouter } from "@tanstack/solid-router";
import { cn } from "cn";
import { createSignal, Show } from "solid-js";
import { EmptyState } from "@/components/empty-state";
import { LogIn } from "@/components/icons";
import { ProviderLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
import { authConfig, providerNames, signIn, signInAsDev } from "@/lib/auth";
import { errorMessage } from "@/lib/format";

type SignInPromptProps = {
  title: string;
  description: string;
  class?: string;
};

export function SignInButton() {
  const router = useRouter();
  const [error, setError] = createSignal("");
  const { oidc } = authConfig;

  async function signInLocally() {
    setError("");
    try {
      await signInAsDev();
      await router.invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

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
      <p class="mt-4 max-w-xs text-xs text-balance text-muted-foreground">
        By signing in, you agree to the{" "}
        <Link
          to="/terms"
          class="underline underline-offset-4 hover:text-foreground"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          to="/privacy"
          class="underline underline-offset-4 hover:text-foreground"
        >
          Privacy Policy
        </Link>
        .
      </p>
      <Show when={error()}>
        <p role="alert" class="mt-3 text-sm text-destructive">
          {error()}
        </p>
      </Show>
    </div>
  );
}

export function SignInPrompt(props: SignInPromptProps) {
  const { oidc, dev } = authConfig;
  if (!oidc && !dev) return null;

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
}
