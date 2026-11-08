import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { scopeDetails, type ApiToken } from "@/lib/tokens";

type TokenListProps = {
  tokens: ApiToken[];
  onRevoke: (id: string) => Promise<void>;
};

export function TokenList({ tokens, onRevoke }: TokenListProps) {
  return (
    <ul className="divide-y rounded-xl border">
      {tokens.map((token) => {
        const cli = token.source === "cli";
        const expired =
          token.expires_at && Date.parse(token.expires_at) < Date.now();
        const details = [
          `Created ${formatDate(token.created_at)}`,
          token.last_used_at
            ? `Last used ${formatDate(token.last_used_at)}`
            : "Never used",
          token.expires_at
            ? `${expired ? "Expired" : "Expires"} ${formatDate(token.expires_at)}`
            : null,
        ];
        return (
          <li
            key={token.id}
            className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
          >
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2">
                <span className="truncate font-medium">{token.name}</span>
                {cli && (
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    CLI sign-in
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {token.scopes
                  .map((scope) => scopeDetails[scope].label)
                  .join(", ")}
                {" · "}
                {details.filter(Boolean).join(" · ")}
              </p>
            </div>
            <ConfirmButton
              question={
                cli ? `Sign out ${token.name}?` : `Revoke ${token.name}?`
              }
              warning={
                cli
                  ? "That machine has to run redoost login again."
                  : "Anything publishing with this token stops working right away."
              }
              action={cli ? "Sign out" : "Revoke token"}
              onConfirm={() => onRevoke(token.id)}
            >
              <Button variant="outline" size="sm" className="shrink-0">
                {cli ? "Sign out" : "Revoke"}
              </Button>
            </ConfirmButton>
          </li>
        );
      })}
    </ul>
  );
}
