import { useState, type MouseEvent } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage, formatDate } from "@/lib/format";
import { scopeDetails, type ApiToken } from "@/lib/tokens";

function RevokeButton({
  token,
  onRevoke,
}: {
  token: ApiToken;
  onRevoke: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState("");
  const cli = token.source === "cli";

  function changeOpen(open: boolean) {
    if (revoking) return;
    setConfirming(open);
    setError("");
  }

  async function confirmRevoke(event: MouseEvent) {
    // Keep the dialog open until the request finishes
    event.preventDefault();
    setRevoking(true);
    setError("");
    try {
      await onRevoke();
    } catch (cause) {
      setError(errorMessage(cause));
      setRevoking(false);
    }
  }

  return (
    <AlertDialog open={confirming} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          {cli ? "Sign out" : "Revoke"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {cli ? `Sign out ${token.name}?` : `Revoke ${token.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {cli
              ? "That machine has to run redoost login again."
              : "Anything publishing with this token stops working right away."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={revoking}
            onClick={confirmRevoke}
          >
            {revoking ? "Working…" : cli ? "Sign out" : "Revoke token"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type TokenListProps = {
  tokens: ApiToken[];
  onRevoke: (id: string) => Promise<void>;
};

export function TokenList({ tokens, onRevoke }: TokenListProps) {
  return (
    <ul className="divide-y rounded-xl border">
      {tokens.map((token) => {
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
                {token.source === "cli" && (
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
            <RevokeButton token={token} onRevoke={() => onRevoke(token.id)} />
          </li>
        );
      })}
    </ul>
  );
}
