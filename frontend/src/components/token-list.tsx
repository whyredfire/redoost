import { For, Show } from "solid-js";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/format";
import { scopeDetails, type ApiToken } from "@/lib/tokens";

type TokenListProps = {
  tokens: ApiToken[];
  onRevoke: (id: string) => Promise<void>;
};

export function TokenList(props: TokenListProps) {
  return (
    <ul class="divide-y rounded-xl bg-card shadow-raised">
      <For each={props.tokens} keyed={(token) => token.id}>
        {(token) => {
          const cli = () => token().source === "cli";
          const details = () => {
            const { created_at, last_used_at, expires_at } = token();
            const expired = expires_at && Date.parse(expires_at) < Date.now();
            return [
              `Created ${formatDate(created_at)}`,
              last_used_at
                ? `Last used ${formatDate(last_used_at)}`
                : "Never used",
              expires_at
                ? `${expired ? "Expired" : "Expires"} ${formatDate(expires_at)}`
                : null,
            ];
          };
          return (
            <li class="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <div class="min-w-0 space-y-1">
                <p class="flex items-center gap-2">
                  <span class="truncate font-medium">{token().name}</span>
                  <Show when={cli()}>
                    <span class="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      CLI sign-in
                    </span>
                  </Show>
                </p>
                <p class="text-xs text-muted-foreground">
                  {token()
                    .scopes.map((scope) => scopeDetails[scope].label)
                    .join(", ")}
                  {" · "}
                  {details().filter(Boolean).join(" · ")}
                </p>
              </div>
              <ConfirmButton
                question={
                  cli()
                    ? `Sign out ${token().name}?`
                    : `Revoke ${token().name}?`
                }
                warning={
                  cli()
                    ? "That machine has to run redoost login again."
                    : "Anything publishing with this token stops working right away."
                }
                action={cli() ? "Sign out" : "Revoke token"}
                onConfirm={() => props.onRevoke(token().id)}
                variant="outline"
                size="sm"
                class="shrink-0"
              >
                {cli() ? "Sign out" : "Revoke"}
              </ConfirmButton>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
