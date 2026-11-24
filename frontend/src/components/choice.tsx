import { Popup } from "@/components/detent/components/popup/Popup";

type ChoiceProps<T extends string> = {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

// Detent's popup picks among labels, so this maps them back to values
export function Choice<T extends string>(props: ChoiceProps<T>) {
  const labels = () => props.options.map(([, text]) => text);
  return (
    <Popup
      label={props.label}
      options={labels()}
      value={props.options.find(([key]) => key === props.value)?.[1]}
      onChange={(text: string) =>
        props.onChange(props.options[labels().indexOf(text)]![0])
      }
      disabled={props.disabled}
    />
  );
}
