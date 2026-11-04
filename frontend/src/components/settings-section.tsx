import type { ReactNode } from "react";

type SettingsSectionProps = {
  title: string;
  description: string;
  // Sits beside the title, like a button to add something
  action?: ReactNode;
  children: ReactNode;
};

export function SettingsSection({
  title,
  description,
  action,
  children,
}: SettingsSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
