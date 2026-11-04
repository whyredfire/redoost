import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";
import { setTheme, useTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/settings/appearance")({
  head: () => ({ meta: [{ title: "Appearance · redoost" }] }),
  component: AppearanceSettings,
});

const themes = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const satisfies { value: Theme; label: string; icon: unknown }[];

function AppearanceSettings() {
  const { theme } = useTheme();

  return (
    <SettingsSection
      title="Theme"
      description="System follows your device, switching when it does. Saved in this browser."
    >
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-3 gap-3"
      >
        {themes.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm text-muted-foreground transition-colors hover:bg-muted/40 has-checked:border-brand has-checked:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => setTheme(value)}
              className="sr-only"
            />
            <Icon className="size-5" />
            {label}
          </label>
        ))}
      </div>
    </SettingsSection>
  );
}
