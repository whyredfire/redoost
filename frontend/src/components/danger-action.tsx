import { omit } from "solid-js";
import { ConfirmButton } from "@/components/confirm-button";

type DangerActionProps = {
  title: string;
  description: string;
  question: string;
  warning: string;
  action: string;
  onConfirm: () => Promise<void>;
};

export function DangerAction(props: DangerActionProps) {
  const confirm = omit(props, "title", "description");
  return (
    <div class="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 px-4 py-3 text-sm">
      <div>
        <p class="font-medium">{props.title}</p>
        <p class="text-muted-foreground">{props.description}</p>
      </div>
      <ConfirmButton
        {...confirm}
        pending="Deleting…"
        variant="destructive"
        size="sm"
        class="shrink-0"
      >
        Delete
      </ConfirmButton>
    </div>
  );
}
