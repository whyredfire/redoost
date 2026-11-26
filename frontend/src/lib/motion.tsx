import type { JSX } from "@solidjs/web";
import { animate } from "motion";
import type { AnimationOptions, DOMKeyframesDefinition } from "motion";
import {
  children,
  createEffect,
  createSignal,
  For,
  onSettled,
  untrack,
} from "solid-js";

const query = matchMedia("(prefers-reduced-motion: reduce)");
const [reduced, setReduced] = createSignal(query.matches);

query.addEventListener("change", (event) => setReduced(event.matches));

export const useReducedMotion = () => reduced;

export type Target = DOMKeyframesDefinition;

type Transition = AnimationOptions | (() => AnimationOptions | undefined);

export const animateTo = (
  element: Element,
  target: Target,
  options?: AnimationOptions
) =>
  animate(
    element,
    target,
    untrack(reduced)
      ? { ...options, type: undefined, duration: 0, delay: 0 }
      : options
  );

interface Finishable {
  then: (onResolve: () => void) => Promise<void>;
}

export const afterAnimation = async (
  animation: Finishable,
  done: () => void
) => {
  await animation;
  done();
};

const isGetter = (
  transition: Transition | undefined
): transition is () => AnimationOptions | undefined =>
  typeof transition === "function";

export const animated = (target: () => Target, transition?: Transition) => {
  let element: Element | undefined;
  let first = true;
  createEffect(
    () => [target(), isGetter(transition) ? transition() : transition] as const,
    ([value, options]) => {
      if (!element) {
        return;
      }

      animateTo(element, value, first ? { duration: 0 } : options);
      first = false;
    }
  );

  return (next: Element) => {
    element = next;
  };
};

const fromTo = (from: Target, to: Target) => {
  const starts = new Map(Object.entries(from));

  const frames: Target = Object.fromEntries(
    Object.entries(to).map(([key, end]) => {
      const start = starts.get(key);

      return [key, start === undefined ? end : [start, end]];
    })
  );

  return frames;
};

interface Entry<T> {
  id: number;
  value: T;
  appear: boolean;
  element?: () => Element | undefined;
}

interface PresenceProps<T> {
  when: T | undefined | null | false;
  initial?: Target;
  animate?: Target;
  exit?: Target;
  transition?: AnimationOptions;
  exitTransition?: AnimationOptions;
  appear?: boolean;
  mode?: "wait" | "sync";
  // WARNING: must render a single element; only the first element child is animated
  children: (value: T) => JSX.Element;
}

export const Presence = <T,>(props: PresenceProps<T>) => {
  const [entries, setEntries] = createSignal<Entry<T>[]>([]);
  let count = 0;
  let current: Entry<T> | undefined;

  const remove = (entry: Entry<T>) =>
    setEntries((list) => list.filter((item) => item !== entry));

  createEffect(
    () => props.when,
    (value) =>
      untrack(() => {
        const first = count === 0;

        if (current && value === current.value) {
          return;
        }

        const leaving = current;

        if (value) {
          count += 1;
          current = {
            id: count,
            value,
            appear: first ? !!props.appear : true,
          };
        } else {
          current = undefined;
        }

        if (first && !value) {
          count += 1;
        }

        const next = current;

        const add = () => {
          if (next) {
            setEntries((list) => [...list, next]);
          }
        };

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
                props.exitTransition ?? props.transition
              )
            : Promise.resolve();

        if (props.mode === "wait") {
          afterAnimation(exit, () => {
            remove(leaving);
            add();
          });
        } else {
          add();
          afterAnimation(exit, () => remove(leaving));
        }
      })
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
              props.transition
            );
          }
        });

        return <>{resolved()}</>;
      }}
    </For>
  );
};
