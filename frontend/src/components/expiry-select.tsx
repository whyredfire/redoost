import { useState } from "react";
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

export function useExpiry(
  value: string | null,
  onChange: (value: string | null) => void,
) {
  const [preset, setPreset] = useState<Preset>(
    value === null ? "never" : "date",
  );

  function choose(next: Preset) {
    setPreset(next);
    if (next === "never") onChange(null);
    else if (next !== "date") onChange(inDays(next));
  }

  return [preset, choose] as const;
}

export function ExpiryDate({ value, onChange, disabled }: ExpiryProps) {
  return (
    <Input
      type="date"
      aria-label="Last day online"
      value={value ? dayOf(value) : ""}
      min={localDay(new Date())}
      onChange={(event) => {
        if (event.target.value) onChange(endOfDay(event.target.value));
      }}
      disabled={disabled}
    />
  );
}

export function ExpirySelect({
  label = "Expires",
  value,
  onChange,
  disabled = false,
}: ExpiryProps & { label?: string }) {
  const [preset, choose] = useExpiry(value, onChange);

  return (
    <div className="space-y-2">
      <Choice
        label={label}
        options={presets.map(([key, text]) => [key, text] as const)}
        value={preset}
        onChange={choose}
        disabled={disabled}
      />
      {preset === "date" && (
        <ExpiryDate value={value} onChange={onChange} disabled={disabled} />
      )}
    </div>
  );
}
