import {
  createFileRoute,
  redirect,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { finishSignIn, signIn, type Callback } from "@/lib/auth";

// Where the provider sends users back after they sign in
export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search): Callback => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    await finishSignIn(deps);
    throw redirect({ to: "/", replace: true });
  },
  errorComponent: SignInFailed,
});

function SignInFailed({ error }: ErrorComponentProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Couldn't sign you in</h1>
      <p role="alert" className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Button onClick={signIn}>Try again</Button>
    </div>
  );
}
