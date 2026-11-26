import { animate, stagger } from "motion";
import { createEffect, createSignal, flush, For, Show } from "solid-js";

import { useReducedMotion } from "@/lib/motion";

const letter = {
  hidden: { opacity: 0, y: "0.4em", filter: "blur(4px)" },
  visible: { opacity: 1, y: "0em", filter: "blur(0px)" },
};

const childrenOf = (element: HTMLElement) => [...element.children];

interface Props {
  words: string[];
}

export const RotatingWord = (props: Props) => {
  const [index, setIndex] = createSignal(0);
  const reduceMotion = useReducedMotion();
  let current!: HTMLSpanElement;

  createEffect(
    () => [reduceMotion(), props.words.length] as const,
    ([reduce, length]) => {
      if (reduce) {
        return;
      }

      const options = { duration: 0.25, delay: stagger(0.03) };

      const timer = setInterval(async () => {
        await animate(childrenOf(current), letter.hidden, options);
        setIndex((previous) => (previous + 1) % length);
        flush();
        animate(
          childrenOf(current),
          {
            opacity: [0, 1],
            y: [letter.hidden.y, letter.visible.y],
            filter: [letter.hidden.filter, letter.visible.filter],
          },
          options
        );
      }, 2800);

      return () => clearInterval(timer);
    }
  );

  return (
    <Show when={!reduceMotion()} fallback={<span>{props.words[0]}</span>}>
      <span class="inline-grid text-left whitespace-pre">
        <For each={props.words}>
          {(word) => (
            <span class="invisible col-start-1 row-start-1">{word}</span>
          )}
        </For>
        <span class="col-start-1 row-start-1">
          <span ref={current} class="inline-block">
            <For each={[...(props.words[index()] ?? "")]} keyed={false}>
              {(char) => <span class="inline-block">{char()}</span>}
            </For>
          </span>
        </span>
      </span>
    </Show>
  );
};
