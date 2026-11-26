import { animate, motionValue, styleEffect, transformValue } from "motion";
import type { MotionValue } from "motion";
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onSettled,
  Show,
  untrack,
} from "solid-js";

import { clamp, feedback, lerp, notched } from "@/components/detent/lib/detent";
import {
  Layer,
  fill,
  frameOf,
  inFrame,
  useDismiss,
  useHost,
  useReposition,
} from "@/components/detent/lib/layer";
import { useReducedMotion } from "@/lib/motion";

const ROW = 36;
const PAD = 6;
const LEFT = 14;
const RIGHT = 34;
const OPEN = { type: "spring", bounce: 0, duration: 0.3 } as const;
const SHUT = { type: "spring", bounce: 0, duration: 0.24 } as const;
const FOLLOW = { type: "spring", stiffness: 900, damping: 60 } as const;
const LOST = 48;
const NOW = { duration: 0 } as const;

const EDGE =
  "drop-shadow(0 0 .5px var(--edge)) drop-shadow(0 1px 1px rgb(0 0 0 / .05))";

const INK = "[--edge:rgb(0_0_0/.3)] dark:[--edge:rgb(255_255_255/.3)]";

const rubber = (d: number) => 18 * (1 - 1 / (1 + d / 60));

const overshoot = (u: number, hi: number) => {
  if (u < 0) {
    return -rubber(-u);
  }

  return u > hi ? rubber(u - hi) : 0;
};

const keyTarget = (key: string, active: number, last: number) => {
  switch (key) {
    case "ArrowUp": {
      return active - 1;
    }

    case "ArrowDown": {
      return active + 1;
    }

    case "Home": {
      return 0;
    }

    case "End": {
      return last;
    }

    default: {
      return null;
    }
  }
};

const Check = () => (
  <svg
    viewBox="0 0 14 14"
    aria-hidden="true"
    class="absolute right-3.5 size-3.5 self-center"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M2.5 7.5 5.6 10.5 11.5 3.5" />
  </svg>
);

const Updown = () => (
  <svg
    viewBox="0 0 10 14"
    aria-hidden="true"
    class="h-3.5 w-2.5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M2 5 5 2l3 3M2 9l3 3 3-3" />
  </svg>
);

interface Live {
  mode: "shut" | "press" | "tap";
  y0: number;
  u0: number;
  left: boolean;
  lost: boolean;
  active: number;
  value: number;
  l: number;
  r: number;
}

export interface PopupProps {
  options: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: string;
  name?: string;
  radius?: number;
  textClass?: string;
  class?: string;
  disabled?: boolean;
}

export const Popup = (props: PopupProps) => {
  const reduce = useReducedMotion();
  const id = createUniqueId();
  const { contained, frame } = useHost();
  const textClass = () => props.textClass ?? "text-[14px] font-medium";

  const [inner, setInner] = createSignal(
    untrack(() => Math.max(0, props.options.indexOf(props.defaultValue ?? "")))
  );

  const value = createMemo(() =>
    props.value === undefined
      ? inner()
      : Math.max(0, props.options.indexOf(props.value))
  );

  const start = untrack(value);
  const [shown, setShown] = createSignal(false);
  const [active, setActive] = createSignal(start);
  const [from, setFrom] = createSignal(start);
  const [spot, setSpot] = createSignal({ x: 0, y: 0 });
  const [width, setWidth] = createSignal(0);

  let pill!: HTMLButtonElement;
  let sheet: HTMLDivElement | undefined;
  const probes: (HTMLSpanElement | undefined)[] = [];
  let nudge = { x: 0, y: 0 };

  const live: Live = {
    mode: "shut",
    y0: 0,
    u0: 0,
    left: false,
    lost: false,
    active: start,
    value: start,
    l: 0,
    r: 0,
  };

  const open = motionValue(0);
  const anchor = motionValue(start);
  const plate = motionValue(start * ROW);
  const pull = motionValue(0);
  const pillW = motionValue(0);
  const on = motionValue(1);
  const fade = motionValue(0);
  const pillO = transformValue(() => 1 - fade.get());
  const height = () => PAD * 2 + ROW * props.options.length;
  let widthRef = 0;
  let tall = 0;
  let radius = 10;
  createEffect(
    () => [height(), props.radius ?? 10] as const,
    ([h, r]) => {
      tall = h;
      radius = r;
    }
  );

  const y = transformValue(
    () => -(PAD + ROW * anchor.get()) + nudge.y * open.get() + pull.get()
  );

  const x = transformValue(() => nudge.x * open.get());

  const clip = transformValue(() => {
    const o = open.get();
    const a = anchor.get();
    const w = pillW.get();
    const top = (PAD + ROW * a) * (1 - o);
    const bottom = (tall - PAD - ROW * (a + 1)) * (1 - o);

    return `inset(${top}px ${(widthRef - w) * (1 - o)}px ${bottom}px 0 round ${lerp(radius, 16, o)}px)`;
  });

  const window_ = transformValue(() => {
    const p = plate.get();

    return `inset(${PAD + p}px ${PAD}px ${tall - PAD - ROW - p}px ${PAD}px round 10px)`;
  });

  const inverted = transformValue(
    () => clamp((open.get() - 0.3) / 0.5, 0, 1) * on.get()
  );

  const widths = () => probes.map((p) => (p?.offsetWidth ?? 0) + LEFT + RIGHT);

  const readWidths = () => {
    probes.length = props.options.length;
    const all = widths();
    pillW.set(all[live.value] ?? 0);
    widthRef = Math.max(...all);
    setWidth(widthRef);
  };

  createEffect(
    () => props.options.join("\n"),
    () => {
      readWidths();
      void document.fonts?.ready.then(readWidths);
    }
  );

  createEffect(value, (v) => {
    if (live.mode !== "shut" || live.value === v) {
      return;
    }

    live.value = v;
    anchor.set(v);
    pillW.set(widths()[v] ?? 0);
  });

  const measure = () => {
    const f = frameOf(frame());
    const box = inFrame(pill.getBoundingClientRect(), f);

    return { f, box };
  };

  const mark = (i: number) => {
    if (live.active === i) {
      return;
    }

    live.active = i;
    setActive(i);
  };

  const show = (instant: boolean) => {
    const s = live;
    const { f, box } = measure();
    const top = box.y - PAD - ROW * s.value;
    nudge = {
      x: Math.min(0, f.width - 8 - (box.x + widthRef)),
      y: top < 12 ? 12 - top : Math.min(0, f.height - 12 - (top + height())),
    };
    setSpot({ x: box.x, y: box.y });
    const at = pill.getBoundingClientRect();
    s.l = at.left + nudge.x;
    s.r = s.l + widthRef;
    s.active = s.value;
    setActive(s.value);
    setFrom(s.value);
    plate.set(s.value * ROW);
    fade.set(1);
    on.set(1);

    if (sheet) {
      sheet.style.pointerEvents = "";
    }

    setShown(true);
    anchor.set(s.value);
    animate(pull, 0, NOW);
    animate(open, 1, instant || reduce() ? NOW : OPEN);
  };

  const settle = async (instant: boolean) => {
    await animate(open, 0, instant || reduce() ? NOW : SHUT);

    if (live.mode === "shut") {
      setShown(false);
    }
  };

  const hide = (instant = false) => {
    const s = live;
    s.mode = "shut";

    if (sheet) {
      sheet.style.pointerEvents = "none";
    }

    animate(pull, 0, SHUT);
    animate(pillW, widths()[s.value] ?? 0, instant || reduce() ? NOW : SHUT);
    animate(
      fade,
      0,
      instant || reduce() ? NOW : { duration: 0.18, ease: [0.2, 0.9, 0.25, 1] }
    );
    void settle(instant);
  };

  const commit = (i: number) => {
    const changed = live.value !== i;
    live.value = i;
    setInner(i);
    hide();

    const option = props.options[i];

    if (changed && option !== undefined) {
      props.onChange?.(option);
    }
  };

  const down = (e: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    if (e.button !== 0 || props.disabled) {
      return;
    }

    const s = live;
    feedback.wake(true);

    if (s.mode !== "shut") {
      return hide();
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    s.mode = "press";
    s.y0 = e.clientY;
    s.u0 = s.value * ROW;
    s.left = false;
    s.lost = false;
    show(false);
  };

  const move = (e: PointerEvent) => {
    const s = live;

    if (s.mode !== "press") {
      return;
    }

    const d = e.clientY - s.y0;
    s.lost = e.clientX < s.l - LOST || e.clientX > s.r + LOST;
    on.set(s.lost ? 0 : 1);
    const hi = ROW * (props.options.length - 1);
    const u = s.u0 + d;
    pull.set(overshoot(u, hi));
    const near = clamp(u, 0, hi);
    plate.set(
      notched(
        near,
        props.options.map((_, i) => i * ROW),
        ROW / 2,
        0.9
      )
    );
    const i = Math.round(near / ROW);

    if (i !== s.active) {
      s.left = true;
      mark(i);
      feedback.tick();
    }
  };

  const up = () => {
    const s = live;

    if (s.mode !== "press") {
      return;
    }

    if (s.lost) {
      return hide();
    }

    if (!s.left) {
      s.mode = "tap";
      pull.set(0);
      animate(plate, s.active * ROW, FOLLOW);

      return;
    }

    commit(s.active);
  };

  const hover = (i: number) => {
    if (live.mode !== "tap") {
      return;
    }

    mark(i);
    animate(plate, i * ROW, reduce() ? NOW : FOLLOW);
  };

  const keys = (e: KeyboardEvent) => {
    const s = live;

    if (s.mode === "shut") {
      if (props.disabled) {
        return;
      }

      if (!["ArrowUp", "ArrowDown", "Enter", " "].includes(e.key)) {
        return;
      }

      e.preventDefault();
      s.mode = "tap";

      return show(true);
    }

    const last = props.options.length - 1;

    const go = keyTarget(e.key, s.active, last);

    if (go !== null) {
      e.preventDefault();
      const i = clamp(go, 0, last);
      mark(i);
      plate.set(i * ROW);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(s.active);
    }
  };

  useDismiss(shown, [() => pill, () => sheet], (why) => hide(why === "escape"));
  useReposition(shown, () => {
    const { box } = measure();
    setSpot({ x: box.x, y: box.y });
  });

  const stops: VoidFunction[] = [];
  const layerStops: VoidFunction[] = [];

  const bind =
    (values: Record<string, MotionValue>, into = layerStops) =>
    (el: HTMLElement) => {
      into.push(styleEffect(el, values));
    };

  createEffect(shown, (s) => {
    if (s) {
      return () => {
        for (const stop of layerStops.splice(0)) {
          stop();
        }
      };
    }
  });
  onSettled(() => () => {
    for (const stop of stops.splice(0)) {
      stop();
    }
  });

  const selected = (i: number) => (i === value() ? "true" : "false");

  const rowClass = "relative flex items-center whitespace-nowrap";

  const rowStyle = () => ({
    height: `${ROW}px`,
    "padding-left": `${LEFT}px`,
  });

  const rows = (ghost: boolean) => (
    <For each={props.options}>
      {(o, i) =>
        ghost ? (
          <div class={rowClass} style={rowStyle()}>
            {o}
            <Show when={i() === from()}>
              <Check />
            </Show>
          </div>
        ) : (
          <div
            id={`${id}-${i()}`}
            role="option"
            aria-selected={selected(i())}
            onPointerMove={() => hover(i())}
            onClick={() => live.mode === "tap" && commit(i())}
            class={rowClass}
            style={rowStyle()}
          >
            {o}
            <Show when={i() === from()}>
              <Check />
            </Show>
          </div>
        )
      }
    </For>
  );

  return (
    <div
      class={`relative inline-block max-w-full align-middle ${INK} ${props.class ?? ""}`}
      style={{ height: `${ROW}px` }}
    >
      <Show when={props.name}>
        <input type="hidden" name={props.name} value={props.options[value()]} />
      </Show>
      <button
        ref={[
          (el: HTMLButtonElement) => (pill = el),
          bind({ opacity: pillO }, stops),
        ]}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-controls={shown() ? `${id}-list` : undefined}
        disabled={props.disabled ?? false}
        aria-expanded={shown() ? "true" : "false"}
        aria-label={props.label}
        aria-activedescendant={shown() ? `${id}-${active()}` : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => hide()}
        onTouchEnd={(e) => e.preventDefault()}
        onKeyDown={keys}
        onBlur={() => live.mode === "tap" && hide(true)}
        class={`ring-focus bg-surface text-ink relative flex touch-none items-center whitespace-nowrap select-none before:absolute before:inset-x-0 before:-inset-y-1 disabled:opacity-50 ${textClass()}`}
        style={{
          height: `${ROW}px`,
          "padding-left": `${LEFT}px`,
          "padding-right": "10px",
          filter: EDGE,
          "border-radius": `${props.radius ?? 10}px`,
          "touch-action": "none",
        }}
      >
        <span style={{ "padding-right": `${RIGHT - 10}px` }}>
          {props.options[value()]}
        </span>
        <span class="text-ink-3 absolute right-[9px]">
          <Updown />
        </span>
      </button>

      <div
        aria-hidden="true"
        class={`pointer-events-none invisible absolute top-0 left-0 ${textClass()}`}
      >
        <For each={props.options} keyed={false}>
          {(o, i) => (
            <span
              ref={(el) => (probes[i] = el)}
              class="absolute whitespace-nowrap"
            >
              {o()}
            </span>
          )}
        </For>
      </div>

      <Show when={shown()}>
        <Layer>
          <div
            ref={bind({ x, y, opacity: fade })}
            class={`pointer-events-none ${fill(contained).split(" ")[0]} z-50 ${INK}`}
            style={{
              left: `${spot().x}px`,
              top: `${spot().y}px`,
              width: `${width()}px`,
              height: `${height()}px`,
            }}
          >
            <div
              ref={bind({ opacity: open })}
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 rounded-[16px] shadow-[0_18px_36px_-6px_rgb(0_0_0/0.22)]"
            />
            <div class="absolute inset-0" style={{ filter: EDGE }}>
              <div
                ref={[
                  (el: HTMLDivElement) => (sheet = el),
                  bind({ clipPath: clip }),
                ]}
                id={`${id}-list`}
                role="listbox"
                aria-label={props.label}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                class={`bg-surface text-ink pointer-events-auto relative select-none ${textClass()}`}
                style={{
                  width: `${width()}px`,
                  height: `${height()}px`,
                  "padding-top": `${PAD}px`,
                  "padding-bottom": `${PAD}px`,
                }}
              >
                {rows(false)}
                <div
                  ref={bind({ clipPath: window_, opacity: inverted })}
                  aria-hidden="true"
                  class="bg-ink text-surface pointer-events-none absolute inset-0"
                  style={{ "padding-top": `${PAD}px` }}
                >
                  {rows(true)}
                </div>
              </div>
            </div>
          </div>
        </Layer>
      </Show>
    </div>
  );
};
