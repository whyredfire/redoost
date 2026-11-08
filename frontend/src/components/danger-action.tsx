import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";

type DangerActionProps = {
  title: string;
  description: string;
  question: string;
  warning: string;
  action: string;
  onConfirm: () => Promise<void>;
};

export function DangerAction({
  title,
  description,
  ...confirm
}: DangerActionProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 px-4 py-3 text-sm">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <ConfirmButton {...confirm} pending="Deleting…">
        <Button variant="destructive" size="sm" className="shrink-0">
          Delete
        </Button>
      </ConfirmButton>
    </div>
  );
}
