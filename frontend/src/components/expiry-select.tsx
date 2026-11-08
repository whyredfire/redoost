import { useState } from "react";
import { Input } from "@cloudflare/kumo/components/input";
import { Select } from "@cloudflare/kumo/components/select";

const presets = [
  { value: "never", label: "Never" },
  { value: "1", label: "In a day" },
  { value: "7", label: "In a week" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "date", label: "On a date" },
];

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

type ExpirySelectProps = {
  id?: string;
  // An ISO time, or null for never
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

export function ExpirySelect({
  id,
  value,
  onChange,
  disabled = false,
}: ExpirySelectProps) {
  const [preset, setPreset] = useState(value === null ? "never" : "date");

  function choose(next: string) {
    setPreset(next);
    if (next === "never") onChange(null);
    else if (next !== "date") onChange(inDays(next));
  }

  return (
    <div className="space-y-2">
      <Select
        id={id}
        aria-label="Expiry"
        className="w-full"
        items={presets}
        value={preset}
        onValueChange={(next) => choose(next as string)}
        disabled={disabled}
      />
      {preset === "date" && (
        <Input
          className="w-full"
          type="date"
          aria-label="Last day online"
          value={value ? dayOf(value) : ""}
          min={localDay(new Date())}
          onChange={(event) => {
            if (event.target.value) onChange(endOfDay(event.target.value));
          }}
          disabled={disabled}
        />
      )}
    </div>
  );
}
