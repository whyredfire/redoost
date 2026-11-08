import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const presets = [
  ["never", "Never"],
  ["1", "In a day"],
  ["7", "In a week"],
  ["30", "In 30 days"],
  ["90", "In 90 days"],
  ["date", "On a date"],
] as const;

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
      <Select value={preset} onValueChange={choose} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === "date" && (
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
      )}
    </div>
  );
}
