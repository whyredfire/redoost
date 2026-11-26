import type { JSX } from "@solidjs/web";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onSettled,
  Show,
  Switch,
  untrack,
} from "solid-js";
import type { Accessor } from "solid-js";

import { afterAnimation, animated, animateTo, Presence } from "@/lib/motion";

export interface PhraseChoice {
  id: string;
  options: string[];
  label?: string;
}

export interface PhraseNumber {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (n: number) => string;
}

export type PhrasePart = string | PhraseChoice | PhraseNumber;

export type PhraseValues = Record<string, string | number>;

const EASE = [0.3, 0, 0.2, 1] as const;
const MUTE = "text-[color-mix(in_oklch,var(--ink)_42%,transparent)]";
const PX = 7;

const MENU =
  "absolute top-[calc(100%+8px)] z-30 rounded-[12px] bg-[light-dark(#ffffff,#26262a)] p-1 text-[13.5px] leading-normal tracking-normal shadow-[0_0_0_0.5px_light-dark(rgb(0_0_0/.14),rgb(255_255_255/.12)),0_2px_4px_rgb(0_0_0/.04),0_16px_36px_-12px_rgb(0_0_0/.25)]";

const MARK =
  "ring-focus relative -mx-1 rounded-[6px] px-1 text-ink underline decoration-dotted decoration-[1.5px] underline-offset-[5px] transition-colors ease-detent";

const OPEN =
  "bg-[light-dark(rgb(0_0_0/.05),rgb(255_255_255/.08))] decoration-transparent";

const SHUT =
  "decoration-[color-mix(in_oklch,var(--ink)_30%,transparent)] hover:decoration-[color-mix(in_oklch,var(--ink)_70%,transparent)]";

const POP = "not-last:absolute";

const isText = (p: PhrasePart): p is string => typeof p === "string";

const isChoice = (p: PhrasePart): p is PhraseChoice =>
  !isText(p) && "options" in p;

const textOf = (p: PhrasePart) => (isText(p) ? p : undefined);

const choiceOf = (p: PhrasePart) => (isChoice(p) ? p : undefined);

const numberOf = (p: PhrasePart) => (isText(p) || isChoice(p) ? undefined : p);

const useOutside = (
  open: Accessor<boolean>,
  box: () => HTMLElement | undefined,
  close: () => void
) => {
  const off = (e: PointerEvent) => {
    if (e.target instanceof Node && box()?.contains(e.target)) {
      return;
    }

    close();
  };

  createEffect(open, (on) => {
    if (!on) {
      return;
    }

    document.addEventListener("pointerdown", off);

    return () => document.removeEventListener("pointerdown", off);
  });
};

const fit = (base: string) => (el: HTMLElement) => {
  // WARNING: Solid calls refs before the element is in the page, so measuring has to wait a microtask
  queueMicrotask(() => {
    el.style.translate = `${base} 0`;
    const r = el.getBoundingClientRect();
    const over = r.right - (window.innerWidth - 8);
    const under = 8 - r.left;
    const dx = over > 0 ? -Math.min(over, r.left - 8) : Math.max(under, 0);

    if (dx) {
      el.style.translate = `calc(${base} + ${dx}px) 0`;
    }
  });
};

const fitLeft = fit("0px");
const fitMiddle = fit("-50%");

const pop = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: -2 },
  exitTransition: { duration: 0.12 },
  transition: { duration: 0.2, ease: EASE },
};

const Word = (props: {
  part: PhraseChoice;
  value: string;
  onPick: (v: string) => void;
}) => {
  const at = createMemo(() =>
    Math.max(0, props.part.options.indexOf(props.value))
  );

  const [open, setOpen] = createSignal(false);
  const [hi, setHi] = createSignal(0);
  const [w, setW] = createSignal<number | null>(null);
  let box!: HTMLSpanElement;
  let btn!: HTMLButtonElement;
  let sizer!: HTMLSpanElement;
  useOutside(
    open,
    () => box,
    () => setOpen(false)
  );

  onSettled(() => {
    const ro = new ResizeObserver(() => setW(sizer.offsetWidth));
    ro.observe(sizer);

    return () => ro.disconnect();
  });

  const pick = (n: number) => {
    const option = props.part.options[n];

    if (option !== undefined) {
      props.onPick(option);
    }

    setOpen(false);
    btn.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    const last = props.part.options.length;

    if (!open()) {
      if (
        e.key !== "ArrowDown" &&
        e.key !== "ArrowUp" &&
        e.key !== "Enter" &&
        e.key !== " "
      ) {
        return;
      }

      e.preventDefault();
      setHi(at());
      setOpen(true);

      return;
    }

    if (e.key === "ArrowDown") {
      setHi((h) => (h + 1) % last);
    } else if (e.key === "ArrowUp") {
      setHi((h) => (h - 1 + last) % last);
    } else if (e.key === "Home") {
      setHi(0);
    } else if (e.key === "End") {
      setHi(last - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      pick(hi());
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);

      if (e.key === "Tab") {
        return;
      }
    } else {
      return;
    }

    e.preventDefault();
  };

  return (
    <span ref={box} class="relative inline-block">
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open() ? "true" : "false"}
        aria-label={
          props.part.label
            ? `${props.part.label}: ${props.part.options[at()]}`
            : undefined
        }
        onClick={() => {
          setHi(at());
          setOpen((o) => !o);
        }}
        onKeyDown={onKey}
        class={`${MARK} ${open() ? OPEN : SHUT}`}
      >
        <span
          ref={sizer}
          aria-hidden="true"
          class="invisible absolute whitespace-nowrap"
        >
          {props.part.options[at()]}
        </span>
        <span
          class="relative inline-block [overflow-x:clip] align-bottom whitespace-nowrap"
          ref={animated(() => ({ width: w() ?? "auto" }), {
            duration: 0.3,
            ease: EASE,
          })}
        >
          <Presence
            when={props.part.options[at()]}
            initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            {(option) => <span class={`inline-block ${POP}`}>{option}</span>}
          </Presence>
        </span>
      </button>
      <Presence when={open()} {...pop}>
        {() => (
          <div
            ref={fitLeft}
            role="listbox"
            aria-label={props.part.label ?? props.part.id}
            class={`${MENU} left-[-10px] min-w-[190px]`}
            style={{ "transform-origin": "24px 0" }}
          >
            <For each={props.part.options}>
              {(o, n) => (
                <div
                  role="option"
                  aria-selected={n() === at() ? "true" : "false"}
                  onPointerEnter={() => setHi(n())}
                  onClick={() => pick(n())}
                  class={`flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 whitespace-nowrap pointer-coarse:h-10 ${n() === hi() ? "text-ink bg-[light-dark(rgb(0_0_0/.045),rgb(255_255_255/.07))]" : "text-ink-2"}`}
                >
                  <span class="flex-1">{o}</span>
                  <Show when={n() === at()}>
                    <svg
                      viewBox="0 0 14 14"
                      class="text-ink size-3.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.7"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m3.2 7.4 2.5 2.4 5.1-5.6" />
                    </svg>
                  </Show>
                </div>
              )}
            </For>
          </div>
        )}
      </Presence>
    </span>
  );
};

const rollOffset = (d: number) => (d > 0 ? "70%" : "-70%");

const tap = (scale: number) => (e: { currentTarget: HTMLElement }) =>
  animateTo(e.currentTarget, { scale });

const Roll = (props: { text: string; dir: number }) => {
  let box!: HTMLSpanElement;
  let ready = false;
  onSettled(() => {
    ready = true;
  });

  const chars = createMemo(() => {
    const all = props.text.split("");

    return all.map((c, i) => ({ c, key: `${all.length - i}-${c}` }));
  });

  return (
    <span ref={box} class="tnum relative inline-flex overflow-hidden">
      <For each={chars()} keyed={(x) => x.key}>
        {(x) => {
          let el!: HTMLSpanElement;
          const fresh = ready;
          onSettled(() => {
            if (fresh) {
              animateTo(
                el,
                { y: [rollOffset(props.dir), "0%"], opacity: [0, 1] },
                { duration: 0.22, ease: EASE }
              );
            }

            return () => {
              if (!el.isConnected) {
                return;
              }

              const ghost = el.cloneNode(true);

              if (!(ghost instanceof HTMLElement)) {
                return;
              }

              Object.assign(ghost.style, {
                position: "absolute",
                left: `${el.offsetLeft}px`,
                top: `${el.offsetTop}px`,
              });
              box.append(ghost);
              afterAnimation(
                animateTo(
                  ghost,
                  { y: rollOffset(-props.dir), opacity: 0 },
                  { duration: 0.22, ease: EASE }
                ),
                () => ghost.remove()
              );
            };
          });

          return (
            <span ref={el} class="inline-block">
              {x().c}
            </span>
          );
        }}
      </For>
    </span>
  );
};

const Dial = (props: {
  part: PhraseNumber;
  value: number;
  onChange: (n: number) => void;
}) => {
  const step = () => props.part.step ?? 1;
  const [dir, setDir] = createSignal(1);
  const [held, setHeld] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  let from = { x: 0, v: 0, moved: false };
  let box!: HTMLSpanElement;
  useOutside(
    open,
    () => box,
    () => setOpen(false)
  );

  const set = (n: number) => {
    const { min, max } = props.part;
    const c = Math.min(max, Math.max(min, Math.round(n / step()) * step()));

    if (c === props.value) {
      return;
    }

    setDir(c > props.value ? 1 : -1);
    props.onChange(c);
  };

  const down = (e: PointerEvent & { currentTarget: HTMLSpanElement }) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    from = { x: e.clientX, v: props.value, moved: false };
    setHeld(true);
  };

  const move = (e: PointerEvent) => {
    if (!held()) {
      return;
    }

    if (Math.abs(e.clientX - from.x) > 3) {
      from.moved = true;
    }

    set(from.v + Math.round((e.clientX - from.x) / PX) * step());
  };

  const up = () => {
    setHeld(false);

    if (!from.moved) {
      setOpen((o) => !o);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 1;

    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      set(props.value + step() * big);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      set(props.value - step() * big);
    } else if (e.key === "Home") {
      set(props.part.min);
    } else if (e.key === "End") {
      set(props.part.max);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else {
      return;
    }

    e.preventDefault();
  };

  const shown = () =>
    props.part.format
      ? props.part.format(props.value)
      : props.value.toLocaleString("en-US");

  const nudge = (d: number) => (
    <button
      type="button"
      onPointerDown={tap(0.92)}
      onPointerUp={tap(1)}
      onPointerLeave={tap(1)}
      onPointerCancel={tap(1)}
      aria-label={
        d < 0
          ? `Less ${props.part.label.toLowerCase()}`
          : `More ${props.part.label.toLowerCase()}`
      }
      disabled={
        d < 0 ? props.value <= props.part.min : props.value >= props.part.max
      }
      onClick={() => set(props.value + d * step())}
      class="ring-focus text-ink-2 hover:text-ink grid size-8 place-items-center rounded-[8px] hover:bg-[light-dark(rgb(0_0_0/.045),rgb(255_255_255/.07))] disabled:opacity-30 pointer-coarse:size-10"
    >
      <svg
        viewBox="0 0 12 12"
        class="size-3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d={d < 0 ? "M3 6h6" : "M3 6h6M6 3v6"} />
      </svg>
    </button>
  );

  return (
    <span ref={box} class="relative inline-block">
      <span
        role="slider"
        tabindex={0}
        aria-label={props.part.label}
        aria-valuenow={props.value}
        aria-valuetext={shown()}
        aria-valuemin={props.part.min}
        aria-valuemax={props.part.max}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setHeld(false)}
        onKeyDown={onKey}
        class={`${MARK} inline-block cursor-ew-resize touch-none select-none ${held() || open() ? OPEN : SHUT}`}
      >
        <Roll text={shown()} dir={dir()} />
      </span>
      <Presence when={open()} {...pop}>
        {() => (
          <span
            ref={fitMiddle}
            class={`${MENU} left-1/2 flex items-center gap-1`}
          >
            {nudge(-1)}
            <span class="tnum text-ink min-w-[56px] text-center text-[13px]">
              {shown()}
            </span>
            {nudge(1)}
          </span>
        )}
      </Presence>
    </span>
  );
};

const first = (parts: PhrasePart[]) =>
  // SAFETY: every choice has at least one option, so options[0] is a string
  Object.fromEntries(
    parts.flatMap((p) =>
      isText(p) ? [] : [[p.id, isChoice(p) ? p.options[0] : p.min]]
    )
  ) as PhraseValues;

export const Phrase = (props: {
  parts: PhrasePart[];
  value?: PhraseValues;
  defaultValue?: PhraseValues;
  onChange?: (values: PhraseValues) => void;
  title?: JSX.Element;
  aside?: JSX.Element;
  says?: (values: PhraseValues) => JSX.Element;
  class?: string;
}) => {
  const [own, setOwn] = createSignal<PhraseValues>(
    untrack(() => ({ ...first(props.parts), ...props.defaultValue }))
  );

  const values = createMemo(() =>
    props.value ? { ...own(), ...props.value } : own()
  );

  const set = (id: string, v: string | number) => {
    const next = { ...values(), [id]: v };

    if (!props.value) {
      setOwn(next);
    }

    props.onChange?.(next);
  };

  const lineKey = createMemo(() =>
    props.parts.flatMap((p) => (isText(p) ? [] : [values()[p.id]])).join("|")
  );

  let sentence!: HTMLDivElement;
  let outer!: HTMLDivElement;
  const [h, setH] = createSignal<number | "auto">("auto");
  const [moving, setMoving] = createSignal(false);
  onSettled(() => {
    const ro = new ResizeObserver(() => setH(sentence.offsetHeight));
    ro.observe(sentence);

    return () => ro.disconnect();
  });
  let runs = 0;
  createEffect(h, (height) => {
    if (height === "auto") {
      return;
    }

    runs += 1;
    const run = runs;
    setMoving(true);
    afterAnimation(
      animateTo(outer, { height }, { duration: 0.3, ease: EASE }),
      () => run === runs && setMoving(false)
    );
  });

  return (
    <section
      class={`w-full rounded-[16px] bg-[light-dark(#ffffff,#1a1a1c)] p-1 shadow-[0_0_0_0.5px_light-dark(rgb(0_0_0/.12),rgb(255_255_255/.1)),0_1px_2px_rgb(0_0_0/.04),0_12px_32px_-20px_rgb(0_0_0/.22)] ${props.class ?? ""}`}
    >
      <Show when={props.title || props.aside}>
        <header class="flex h-10 items-center gap-2 px-4">
          <Show when={props.title}>
            <h3 class="text-ink-2 text-[13px] font-medium">{props.title}</h3>
          </Show>
          <span class="flex-1" />
          <Show when={props.aside}>
            <span class={`text-[12.5px] ${MUTE}`}>{props.aside}</span>
          </Show>
        </header>
      </Show>
      <div class="rounded-[12px] bg-[light-dark(#f6f6f5,#222225)] px-4">
        <div ref={outer} class={moving() ? "overflow-hidden" : ""}>
          <div
            ref={sentence}
            class={`py-5 text-[19px] leading-[1.6] tracking-[-0.022em] ${MUTE}`}
          >
            <For
              // WARNING: keep keyed={false}; the parts array is rebuilt on every value change, so keying by identity would remount every word
              each={props.parts}
              keyed={false}
            >
              {(p) => (
                <Switch>
                  <Match when={textOf(p())}>{(text) => <>{text()}</>}</Match>
                  <Match when={choiceOf(p())}>
                    {(part) => (
                      <Word
                        part={part()}
                        value={String(values()[part().id])}
                        onPick={(v) => set(part().id, v)}
                      />
                    )}
                  </Match>
                  <Match when={numberOf(p())}>
                    {(part) => (
                      <Dial
                        part={part()}
                        value={Number(values()[part().id])}
                        onChange={(v) => set(part().id, v)}
                      />
                    )}
                  </Match>
                </Switch>
              )}
            </For>
          </div>
        </div>
        <Show when={props.says}>
          <div
            aria-live="polite"
            class="flex min-h-10 items-center overflow-hidden text-[12.5px] shadow-[inset_0_1px_0_light-dark(rgb(0_0_0/.07),rgb(255_255_255/.07))]"
          >
            <Presence
              when={lineKey()}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              {(key) => {
                const line = createMemo<JSX.Element>((prev) =>
                  lineKey() === key ? props.says?.(values()) : prev
                );

                return (
                  <span class={`tnum text-ink-3 py-2.5 ${POP}`}>{line()}</span>
                );
              }}
            </Presence>
          </div>
        </Show>
      </div>
    </section>
  );
};
