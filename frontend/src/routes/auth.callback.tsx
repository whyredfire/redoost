import {
  createFileRoute,
  redirect,
  type ErrorComponentProps,
} from "@tanstack/solid-router";
import { Button } from "@/components/ui/button";
import { finishSignIn, signIn, type Callback } from "@/lib/auth";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Signing in · redoost" }] }),
  validateSearch: (search): Callback => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const returnTo = await finishSignIn(deps);
    throw redirect({ href: returnTo, replace: true });
  },
  errorComponent: SignInFailed,
});

function SignInFailed(props: ErrorComponentProps) {
  return (
    <div class="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 class="text-2xl font-semibold tracking-tighter">
        Couldn't sign you in
      </h1>
      <p role="alert" class="text-sm text-muted-foreground">
        {errorMessage(props.error)}
      </p>
      <Button onClick={signIn}>Try again</Button>
    </div>
  );
}
