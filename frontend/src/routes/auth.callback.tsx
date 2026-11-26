import { errorMessage } from "@redoost/shared";
import { createFileRoute, redirect } from "@tanstack/solid-router";
import type { ErrorComponentProps } from "@tanstack/solid-router";

import { Button } from "@/components/ui/button";
import { finishSignIn, signIn } from "@/lib/auth";
import type { Callback } from "@/lib/auth";

const isString = (value: unknown): value is string => typeof value === "string";

const SignInFailed = (props: ErrorComponentProps) => (
  <div class="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
    <h1 class="text-2xl font-semibold tracking-tighter">
      Couldn't sign you in
    </h1>
    <p role="alert" class="text-muted-foreground text-sm">
      {errorMessage(props.error)}
    </p>
    <Button onClick={signIn}>Try again</Button>
  </div>
);

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Signing in · redoost" }] }),
  validateSearch: (search) =>
    ({
      code: isString(search.code) ? search.code : undefined,
      state: isString(search.state) ? search.state : undefined,
      error: isString(search.error) ? search.error : undefined,
    }) satisfies Callback,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const returnTo = await finishSignIn(deps);
    throw redirect({ href: returnTo, replace: true });
  },
  errorComponent: SignInFailed,
});
