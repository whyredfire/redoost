import { createSignal, Show, untrack, type Accessor } from "solid-js";
import { Choice } from "@/components/choice";
import { Input } from "@/components/ui/input";

// How each reads on its own, and within a sentence
export const presets = [
  ["never", "Never", "until it's deleted"],
  ["1", "In a day", "for a day"],
  ["7", "In a week", "for a week"],
  ["30", "In 30 days", "for 30 days"],
  ["90", "In 90 days", "for 90 days"],
  ["date", "On a date", "until a date"],
] as const;

export type Preset = (typeof presets)[number][0];

function inDays(days: string) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date.toISOString();
}

function localDay(date: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Online through the day, so it ends at the next local midnight
function endOfDay(day: string) {
  const date = new Date(`${day}T00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

// The last day something expiring at this time is online
function dayOf(value: string) {
  return localDay(new Date(Date.parse(value) - 1));
}

type ExpiryProps = {
  // An ISO time, or null for never
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

// The preset comes from the first value only; later values are picked through it
export function useExpiry(
  value: Accessor<string | null>,
  onChange: (value: string | null) => void,
) {
  const [preset, setPreset] = createSignal<Preset>(
    untrack(value) === null ? "never" : "date",
  );

  function choose(next: Preset) {
    setPreset(next);
    if (next === "never") onChange(null);
    else if (next !== "date") onChange(inDays(next));
  }

  return [preset, choose] as const;
}

export function ExpiryDate(props: ExpiryProps) {
  return (
    <Input
      type="date"
      aria-label="Last day online"
      value={props.value ? dayOf(props.value) : ""}
      min={localDay(new Date())}
      onInput={(event) => {
        if (event.currentTarget.value)
          props.onChange(endOfDay(event.currentTarget.value));
      }}
      disabled={props.disabled}
    />
  );
}

export function ExpirySelect(props: ExpiryProps & { label?: string }) {
  const [preset, choose] = useExpiry(
    () => props.value,
    (value) => props.onChange(value),
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
}
