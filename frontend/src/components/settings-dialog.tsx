import { useEffect, useState } from "react";
import { DangerAction } from "@/components/danger-action";
import { StorageUsage } from "@/components/storage-usage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { providerNames, type User } from "@/lib/auth";
import { readUsage, type Usage } from "@/lib/deploy";
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
        <DangerAction
          title="Delete account"
          description="Deletes your account and all your sites."
          question="Delete your account?"
          warning="Your account and all your sites are deleted, and the sites go offline right away. This can't be undone."
          action="Delete account"
          onConfirm={onDelete}
        />
      </DialogContent>
    </Dialog>
  );
}
