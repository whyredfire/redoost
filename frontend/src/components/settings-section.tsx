import type { JSX } from "@solidjs/web";

type SettingsSectionProps = {
  title: string;
  description: string;
  action?: JSX.Element;
  children: JSX.Element;
};

export function SettingsSection(props: SettingsSectionProps) {
  return (
    <section class="space-y-4">
      <div class="flex items-end justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold tracking-tight">{props.title}</h2>
          <p class="text-sm text-muted-foreground">{props.description}</p>
        </div>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}
