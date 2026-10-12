import { useEffect, useState } from "react";
import { DeleteAccount } from "@/components/delete-account";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { providerNames, type User } from "@/lib/auth";
import { readUsage, type Usage } from "@/lib/deploy";
import { formatBytes } from "@/lib/format";
import { loadToken } from "@/lib/session";

type SettingsDialogProps = {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => Promise<void>;
};

export function SettingsDialog({
  user,
  open,
  onOpenChange,
  onDelete,
}: SettingsDialogProps) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);

  // Loaded on every open, so it reflects sites published or deleted since
  useEffect(() => {
    const token = loadToken();
    if (!open || !token) return;
    setFailed(false);
    readUsage(token).then(setUsage, () => setFailed(true));
  }, [open]);

  const details = [
    { label: "Name", value: user?.name },
    { label: "Email", value: user?.email },
    { label: "Signed in with", value: user && providerNames[user.provider] },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Your account and how much it uses.
          </DialogDescription>
        </DialogHeader>
        <section className="min-w-0 space-y-3">
          <h3 className="text-sm font-medium">Account</h3>
          <dl className="divide-y rounded-lg border text-sm">
            {details.map(
              ({ label, value }) =>
                value && (
                  <div
                    key={label}
                    className="flex justify-between gap-4 px-4 py-3"
                  >
                    <dt className="shrink-0 text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 truncate">{value}</dd>
                  </div>
                ),
            )}
          </dl>
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Storage</h3>
          <div className="space-y-3 rounded-lg border px-4 py-3 text-sm">
            {usage ? (
              <StorageUsage usage={usage} />
            ) : (
              <p className="text-muted-foreground">
                {failed ? "Storage use couldn't be loaded." : "Loading…"}
              </p>
            )}
          </div>
        </section>
        <DeleteAccount onDelete={onDelete} />
      </DialogContent>
    </Dialog>
  );
}

function StorageUsage({ usage }: { usage: Usage }) {
  const percentage = Math.min((usage.used / usage.limit) * 100, 100);
  const color =
    percentage >= 95
      ? "[&_[data-slot=progress-indicator]]:bg-destructive"
      : percentage >= 80
        ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
        : "";

  return (
    <>
      <div className="flex justify-between gap-4 font-mono">
        <span>
          {formatBytes(usage.used)}{" "}
          <span className="text-muted-foreground">
            of {formatBytes(usage.limit)} used
          </span>
        </span>
        <span className="text-muted-foreground">
          {Number(percentage.toFixed(1))}%
        </span>
      </div>
      <Progress
        // A sliver stays visible, so a little use doesn't look like none
        value={usage.used > 0 ? Math.max(percentage, 2) : 0}
        className={color}
        aria-label="Storage used"
      />
      <p className="text-muted-foreground">
        Sites you publish, and uploads in progress, count toward this.
      </p>
    </>
  );
}
