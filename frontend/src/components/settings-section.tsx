import type { JSX } from "@solidjs/web";

interface SettingsSectionProps {
  title: string;
  description: string;
  action?: JSX.Element;
  children: JSX.Element;
}

export const SettingsSection = (props: SettingsSectionProps) => (
  <section class="space-y-4">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">{props.title}</h2>
        <p class="text-muted-foreground text-sm">{props.description}</p>
      </div>
      {props.action}
    </div>
    {props.children}
  </section>
);
