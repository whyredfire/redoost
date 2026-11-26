import type { Scope } from "@redoost/shared";

export const scopeDetails: Record<
  Scope,
  { label: string; description: string }
> = {
  read: {
    label: "Read",
    description: "List your sites, their files, and your storage use.",
  },
  publish: {
    label: "Publish",
    description: "Create sites and update them.",
  },
  manage: {
    label: "Manage",
    description:
      "Take sites offline or online, describe them, and delete them.",
  },
};
