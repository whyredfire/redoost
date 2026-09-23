import { Check, Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/deploy";
import { loadToken } from "@/lib/session";

type TokenDialogProps = {
  onImport: (token: string) => Promise<void>;
};

export function TokenDialog({ onImport }: TokenDialogProps) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  function changeOpen(next: boolean) {
    if (importing) return;
    if (next) {
      setToken(loadToken());
      setRevealed(false);
      setCopied(false);
      setDraft("");
      setError("");
    }
    setOpen(next);
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The clipboard can be blocked, so show the token to copy by hand
      setRevealed(true);
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setImporting(true);
    setError("");
    try {
      await onImport(value);
      setOpen(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        setError("This token doesn't match any sites.");
      } else {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Your token"
        >
          <KeyRound />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your token</DialogTitle>
          <DialogDescription>
            Your sites are tied to this token. Copy it to manage them on another
            device. Anyone with it can delete your sites.
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border px-3 py-2 font-mono text-sm">
              {revealed ? token : "•".repeat(24)}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={revealed ? "Hide token" : "Show token"}
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={copied ? "Token copied" : "Copy token"}
              onClick={copy}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You'll get a token when you publish your first site.
          </p>
        )}

        <form className="space-y-2 border-t pt-4" onSubmit={submit}>
          <label htmlFor="import-token" className="block text-sm font-medium">
            Import a token
          </label>
          {token && (
            <p className="text-sm text-muted-foreground">
              This replaces the current token. Copy it first to keep access to
              its sites.
            </p>
          )}
          <div className="flex gap-2">
            <Input
              id="import-token"
              className="font-mono"
              placeholder="Paste a token"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button type="submit" disabled={!draft.trim() || importing}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
