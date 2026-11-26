import { Popup } from "@/components/detent/components/popup/popup";

interface ChoiceProps<T extends string> {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export const Choice = <T extends string>(props: ChoiceProps<T>) => {
  const labels = () => props.options.map(([, text]) => text);

  return (
    <Popup
      label={props.label}
      options={labels()}
      value={props.options.find(([key]) => key === props.value)?.[1]}
      onChange={(text: string) => {
        const option = props.options[labels().indexOf(text)];

        if (option) {
          props.onChange(option[0]);
        }
      }}
      disabled={props.disabled}
    />
  );
};
