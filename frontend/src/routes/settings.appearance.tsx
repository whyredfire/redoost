import { createFileRoute } from "@tanstack/solid-router";
import { For } from "solid-js";

import { Monitor, Moon, Sun } from "@/components/icons";
import { SettingsSection } from "@/components/settings-section";
import { setTheme, useTheme } from "@/lib/theme";
import type { Theme } from "@/lib/theme";

const themes = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const satisfies { value: Theme; label: string; icon: unknown }[];

const AppearanceSettings = () => {
  const { theme } = useTheme();

  return (
    <SettingsSection
      title="Theme"
      description="System follows your device, switching when it does. Saved in this browser."
    >
      <div role="radiogroup" aria-label="Theme" class="grid grid-cols-3 gap-3">
        <For each={themes}>
          {(option) => (
            <label class="text-muted-foreground hover:bg-muted/40 has-checked:border-brand has-checked:text-foreground has-focus-visible:ring-ring flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm transition-colors has-focus-visible:ring-2">
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme() === option.value}
                onChange={() => setTheme(option.value)}
                class="sr-only"
              />
              <option.icon class="size-5" />
              {option.label}
            </label>
          )}
        </For>
      </div>
    </SettingsSection>
  );
};

export const Route = createFileRoute("/settings/appearance")({
  head: () => ({ meta: [{ title: "Appearance · redoost" }] }),
  component: AppearanceSettings,
});
