import { createSignal, Show, untrack } from "solid-js";
import type { Accessor } from "solid-js";

import { Choice } from "@/components/choice";
import { Input } from "@/components/ui/input";

export const presets = [
  ["never", "Never", "until it's deleted"],
  ["1", "In a day", "for a day"],
  ["7", "In a week", "for a week"],
  ["30", "In 30 days", "for 30 days"],
  ["90", "In 90 days", "for 90 days"],
  ["date", "On a date", "until a date"],
] as const;

export type Preset = (typeof presets)[number][0];

const inDays = (days: string) => {
  const date = new Date();
  date.setDate(date.getDate() + Number(days));

  return date.toISOString();
};

const pad = (part: number) => String(part).padStart(2, "0");

const localDay = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const endOfDay = (day: string) => {
  const date = new Date(`${day}T00:00`);
  date.setDate(date.getDate() + 1);

  return date.toISOString();
};

const lastDayOnline = (expiresAt: string) =>
  localDay(new Date(Date.parse(expiresAt) - 1));

interface ExpiryProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export const useExpiry = (
  value: Accessor<string | null>,
  onChange: (value: string | null) => void
) => {
  const [preset, setPreset] = createSignal<Preset>(
    untrack(value) === null ? "never" : "date"
  );

  const choose = (next: Preset) => {
    setPreset(next);

    if (next === "never") {
      onChange(null);
    } else if (next !== "date") {
      onChange(inDays(next));
    }
  };

  return [preset, choose] as const;
};

export const ExpiryDate = (props: ExpiryProps) => (
  <Input
    type="date"
    aria-label="Last day online"
    value={props.value ? lastDayOnline(props.value) : ""}
    min={localDay(new Date())}
    onInput={(event) => {
      if (event.currentTarget.value) {
        props.onChange(endOfDay(event.currentTarget.value));
      }
    }}
    disabled={props.disabled}
  />
);

export const ExpirySelect = (props: ExpiryProps & { label?: string }) => {
  const [preset, choose] = useExpiry(
    () => props.value,
    (value) => props.onChange(value)
  );

  return (
    <div class="space-y-2">
      <Choice
        label={props.label ?? "Expires"}
        options={presets.map(([key, text]) => [key, text] as const)}
        value={preset()}
        onChange={choose}
        disabled={props.disabled ?? false}
      />
      <Show when={preset() === "date"}>
        <ExpiryDate
          value={props.value}
          onChange={props.onChange}
          disabled={props.disabled ?? false}
        />
      </Show>
    </div>
  );
};
