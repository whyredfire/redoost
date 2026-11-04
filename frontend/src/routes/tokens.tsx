import { createFileRoute, useRouter } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { NewTokenDialog } from "@/components/new-token-dialog";
import { PageHeading } from "@/components/page-heading";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { TokenList } from "@/components/token-list";
import { ApiError } from "@/lib/api";
import { clearToken, loadToken, useToken } from "@/lib/session";
import { listTokens, revokeToken } from "@/lib/tokens";

export const Route = createFileRoute("/tokens")({
  head: () => ({ meta: [{ title: "API tokens · redoost" }] }),
  loader: loadTokens,
  component: TokensPage,
  errorComponent: () => (
    <p role="alert" className="text-sm text-destructive">
      Your tokens couldn't be loaded. Try again in a moment.
    </p>
  ),
});

async function loadTokens() {
  const token = loadToken();
  if (!token) return [];
  try {
    return await listTokens(token);
  } catch (error) {
    // Expired or unknown, so the page asks to sign in again
    if (error instanceof ApiError && error.status === 401) {
      clearToken();
      return [];
    }
    throw error;
  }
}

function TokensPage() {
  const tokens = Route.useLoaderData();
  const token = useToken();
  const router = useRouter();

  async function revoke(id: string) {
    const token = loadToken();
    if (!token) throw new Error("Sign in again to revoke this token.");
    await revokeToken(id, token);
    await router.invalidate();
  }

  return (
    <>
      <PageHeading title="API tokens">
        Where you're signed in from the CLI, and tokens for pipelines to publish
        with.
      </PageHeading>
      {!token ? (
        <SignInPrompt
          title="Sign in to see your tokens"
          description="Tokens let the CLI and pipelines act as your account."
        />
      ) : (
        <div className="space-y-6">
          {tokens.length > 0 ? (
            <>
              <div className="flex justify-end">
                <NewTokenDialog onCreated={() => router.invalidate()} />
              </div>
              <TokenList tokens={tokens} onRevoke={revoke} />
            </>
          ) : (
            <EmptyState
              icon={KeyRound}
              title="No tokens yet"
              description="Sign in from the CLI, or make a token for a pipeline."
            >
              <NewTokenDialog onCreated={() => router.invalidate()} />
            </EmptyState>
          )}
        </div>
      )}
    </>
  );
}
