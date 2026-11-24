import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { NewTokenDialog } from "@/components/new-token-dialog";
import { SettingsSection } from "@/components/settings-section";
import { TokenList } from "@/components/token-list";
import { loadSignedIn, loadToken } from "@/lib/session";
import { listTokens, revokeToken } from "@/lib/tokens";

export const Route = createFileRoute("/settings/tokens")({
  loader: () => loadSignedIn(listTokens),
  head: () => ({ meta: [{ title: "API tokens · redoost" }] }),
  component: TokenSettings,
  errorComponent: () => (
    <p role="alert" class="text-sm text-destructive">
      Your tokens couldn't be loaded. Try again in a moment.
    </p>
  ),
});

function TokenSettings() {
  const loaded = Route.useLoaderData();
  const tokens = () => loaded() ?? [];
  const router = useRouter();

  async function revoke(id: string) {
    const token = loadToken();
    if (!token) throw new Error("Sign in again to revoke this token.");
    await revokeToken(id, token);
    await router.invalidate();
  }

  return (
    <SettingsSection
      title="API tokens"
      description="Where you're signed in from the CLI, and tokens for pipelines to publish with."
      action={<NewTokenDialog onCreated={() => router.invalidate()} />}
    >
      <Show
        when={tokens().length > 0}
        fallback={
          <p class="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">
            No tokens yet. Sign in from the CLI, or make one for a pipeline.
          </p>
        }
      >
        <TokenList tokens={tokens()} onRevoke={revoke} />
      </Show>
    </SettingsSection>
  );
}
