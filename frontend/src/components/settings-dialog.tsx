import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  listDeployments,
  readUsage,
  type Deployment,
  type Usage,
} from "@/lib/deploy";
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
  const [sites, setSites] = useState<Deployment[]>([]);
  const [failed, setFailed] = useState(false);

  // Loaded on every open, so it reflects sites published or deleted since
  useEffect(() => {
    const token = loadToken();
    if (!open || !token) return;
    setFailed(false);
    const loading = Promise.all([readUsage(token), listDeployments(token)]);
    loading.then(
      ([usage, sites]) => {
        setUsage(usage);
        setSites(sites);
      },
      () => setFailed(true),
    );
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
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Account</h3>
          <dl className="divide-y rounded-lg border text-sm">
            {details.map(
              ({ label, value }) =>
                value && (
                  <div
                    key={label}
                    className="flex justify-between gap-4 px-4 py-3"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="truncate">{value}</dd>
                  </div>
                ),
            )}
          </dl>
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Storage</h3>
          <div className="space-y-3 overflow-hidden rounded-lg border px-4 py-3 text-sm">
            {usage ? (
              <StorageUsage usage={usage} sites={sites} />
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

type StorageUsageProps = { usage: Usage; sites: Deployment[] };

function StorageUsage({ usage, sites }: StorageUsageProps) {
  const percentage = Math.min((usage.used / usage.limit) * 100, 100);
  const color =
    percentage >= 95
      ? "[&_[data-slot=progress-indicator]]:bg-destructive"
      : percentage >= 80
        ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
        : "";

  return (
    <>
      <div className="flex justify-between gap-4 tabular-nums">
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
      {sites.length > 0 && <SiteUsage sites={sites} />}
    </>
  );
}

function SiteUsage({ sites }: { sites: Deployment[] }) {
  const largest = sites.toSorted((a, b) => b.total_size - a.total_size);

  return (
    <Collapsible className="-mx-4 -mb-3 border-t">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 font-medium outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
        Usage by site
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="max-h-48 divide-y overflow-y-auto border-t">
          {largest.map((site) => (
            <li
              key={site.slug}
              className="flex justify-between gap-4 px-4 py-2.5 tabular-nums"
            >
              <span className="truncate">{site.slug}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatBytes(site.total_size)}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
