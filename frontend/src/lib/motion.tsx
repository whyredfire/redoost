import type { JSX } from "@solidjs/web";
import {
  animate,
  type AnimationOptions,
  type DOMKeyframesDefinition,
} from "motion";
import {
  children,
  createEffect,
  createSignal,
  For,
  onSettled,
  untrack,
} from "solid-js";

// Stands in for motion/react's MotionConfig reducedMotion="user"
const query = matchMedia("(prefers-reduced-motion: reduce)");
const [reduced, setReduced] = createSignal(query.matches);
query.addEventListener("change", (event) => setReduced(event.matches));

export function useReducedMotion() {
  return reduced;
}

export type Target = DOMKeyframesDefinition;

// motion's animate, instant when motion is reduced
export function animateTo(
  element: Element,
  target: Target,
  options?: AnimationOptions,
) {
  // Read when the animation starts; a later change doesn't restart it
  return animate(
    element,
    target,
    untrack(reduced)
      ? { ...options, type: undefined, duration: 0, delay: 0 }
      : options,
  );
}

// motion.div's animate prop, as a ref: follows target(), jumping to the first one like initial={false}
export function animated(
  target: () => Target,
  transition?: AnimationOptions | (() => AnimationOptions | undefined),
) {
  let element: Element | undefined;
  let first = true;
  createEffect(
    () =>
      [
        target(),
        typeof transition === "function" ? transition() : transition,
      ] as const,
    ([value, options]) => {
      if (!element) return;
      animateTo(element, value, first ? { duration: 0 } : options);
      first = false;
    },
  );
  return (next: Element) => {
    element = next;
  };
}

function fromTo(from: Target, to: Target): Target {
  const frames: Record<string, unknown> = {};
  for (const key of Object.keys(to)) {
    const start = (from as Record<string, unknown>)[key];
    const end = (to as Record<string, unknown>)[key];
    frames[key] = start === undefined ? end : [start, end];
  }
  return frames as Target;
}

type Entry<T> = {
  id: number;
  value: T;
  appear: boolean;
  element?: () => Element | undefined;
};

type PresenceProps<T> = {
  // Each distinct truthy value is its own child, like a key; falsy shows nothing
  when: T | undefined | null | false;
  // Where an entering child starts; left out, it appears without animating
  initial?: Target;
  animate?: Target;
  exit?: Target;
  transition?: AnimationOptions;
  exitTransition?: AnimationOptions;
  // AnimatePresence's initial: false (the default) skips the first child's entrance
  appear?: boolean;
  // AnimatePresence mode="wait": the old child leaves before the new one enters
  mode?: "wait" | "sync";
  // Must render a single element, which is what animates
  children: (value: T) => JSX.Element;
};

// AnimatePresence: keeps a removed child mounted until its exit animation ends
export function Presence<T>(props: PresenceProps<T>) {
  const [entries, setEntries] = createSignal<Entry<T>[]>([]);
  let count = 0;
  let current: Entry<T> | undefined;

  createEffect(
    () => props.when,
    (value) =>
      // Props are read as they are when the child changes, not tracked
      untrack(() => {
        const first = count === 0;
        if (current && value === current.value) return;
        const leaving = current;
        current = value
          ? {
              id: ++count,
              value: value as T,
              appear: first ? !!props.appear : true,
            }
          : undefined;
        if (first && !value) count++;
        const next = current;
        const add = () => {
          if (next) setEntries((list) => [...list, next]);
        };
        const remove = (entry: Entry<T>) =>
          setEntries((list) => list.filter((item) => item !== entry));
        if (!leaving) {
          add();
          return;
        }
        const element = leaving.element?.();
        const exit =
          element && props.exit
            ? animateTo(
                element,
                props.exit,
                props.exitTransition ?? props.transition,
              )
            : Promise.resolve();
        if (props.mode === "wait") {
          exit.then(() => {
            remove(leaving);
            add();
          });
        } else {
          add();
          exit.then(() => remove(leaving));
        }
      }),
  );

  return (
    <For each={entries()}>
      {(entry) => {
        const resolved = children(() => props.children(entry.value));
        entry.element = () =>
          resolved
            .toArray()
            .find((node): node is Element => node instanceof Element);
        onSettled(() => {
          const element = entry.element?.();
          if (entry.appear && element && props.initial && props.animate) {
            animateTo(
              element,
              fromTo(props.initial, props.animate),
              props.transition,
            );
          }
        });
        return <>{resolved()}</>;
      }}
    </For>
  );
}
