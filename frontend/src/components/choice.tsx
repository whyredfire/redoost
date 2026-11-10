import { Popup } from "@/components/detent/components/popup/Popup";

type ChoiceProps<T extends string> = {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

// Detent's popup picks among labels, so this maps them back to values
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: ChoiceProps<T>) {
  const labels = options.map(([, text]) => text);
  return (
    <Popup
      label={label}
      options={labels}
      value={options.find(([key]) => key === value)?.[1]}
      onChange={(text) => onChange(options[labels.indexOf(text)]![0])}
      disabled={disabled}
    />
  );
}
