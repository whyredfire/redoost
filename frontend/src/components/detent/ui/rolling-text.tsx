import { animate, motionValue, styleEffect } from "motion";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onSettled,
  Show,
  untrack,
} from "solid-js";

import { animated } from "@/lib/motion";

const roll = {
  type: "spring",
  stiffness: 380,
  damping: 34,
  mass: 0.8,
} as const;

const Digit = (props: { d: number; width?: number; still: boolean }) => {
  const w = motionValue<string>(
    untrack(() => (props.width === undefined ? "1ch" : `${props.width}em`))
  );

  let had = untrack(() => props.width !== undefined);
  let stop: VoidFunction | undefined;
  onSettled(() => () => stop?.());

  createEffect(
    () => props.width,
    (width) => {
      if (width === undefined) {
        return;
      }

      if (!had) {
        had = true;
        w.set(`${width}em`);

        return;
      }

      const ctl = animate(w, `${width}em`, roll);

      return () => ctl.stop();
    }
  );

  return (
    <span
      ref={(el) => (stop = styleEffect(el, { width: w }))}
      aria-hidden="true"
      class="relative inline-block overflow-hidden"
      style={{ height: "1.25em" }}
    >
      <span
        class="absolute inset-x-0 top-0 flex flex-col items-center"
        ref={animated(
          () => ({ y: `${-props.d * 10}%` }),
          () => (props.still ? { duration: 0 } : roll)
        )}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span class="block" style={{ height: "1.25em" }}>
            {n}
          </span>
        ))}
      </span>
    </span>
  );
};

export const RollingText = (props: {
  text: string;
  class?: string;
  proportional?: boolean;
  still?: boolean;
}) => {
  const chars = createMemo(() => {
    const all = [...props.text];

    return all.map((c, i) => ({
      c,
      digit: /\d/u.test(c),
      key: /\d/u.test(c) ? `${all.length - i}` : `${all.length - i}${c}`,
    }));
  });

  let probe: HTMLSpanElement | undefined;
  const [widths, setWidths] = createSignal<number[] | null>(null);

  createEffect(
    () => !!props.proportional,
    (proportional) => {
      if (!proportional || !probe) {
        return;
      }

      const read = () => {
        const box = probe;

        if (!box) {
          return;
        }

        const z = box.offsetWidth
          ? box.getBoundingClientRect().width / box.offsetWidth
          : 1;

        const em =
          Number(getComputedStyle(box).fontSize.replace(/px$/u, "")) || 16;

        setWidths(
          [...box.children].map((c) => c.getBoundingClientRect().width / z / em)
        );
      };

      read();
      void document.fonts?.ready.then(read);
    }
  );

  return (
    <span
      class={`relative inline-flex ${props.proportional ? "" : "tnum"} ${props.class ?? ""}`}
      style={{ "line-height": "1.25em", height: "1.25em" }}
    >
      <span class="sr-only">{props.text}</span>
      <Show when={props.proportional}>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute top-0 left-0 size-0 overflow-hidden"
        >
          <span
            ref={(el) => (probe = el)}
            class="invisible flex w-max whitespace-pre"
          >
            {Array.from({ length: 10 }, (_, n) => (
              <span>{n}</span>
            ))}
          </span>
        </span>
      </Show>
      <For each={chars()} keyed={(x) => x.key}>
        {(x) => (
          <Show
            when={x().digit}
            fallback={
              <span aria-hidden="true" class="whitespace-pre">
                {x().c}
              </span>
            }
          >
            <Digit
              d={+x().c}
              width={props.proportional ? widths()?.[+x().c] : undefined}
              still={!!props.still}
            />
          </Show>
        )}
      </For>
    </span>
  );
};
