import { Portal } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import {
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import type { Accessor } from "solid-js";

import { spring } from "@/components/detent/lib/motion";
import { animated, useReducedMotion } from "@/lib/motion";

interface Host {
  layers: Accessor<HTMLElement | null>;
  frame: Accessor<HTMLElement | null>;
  recede: (on: boolean) => void;
}

const HostContext = createContext<Host | null>(null);

export const LayerHost = (props: {
  children: JSX.Element;
  class?: string;
  layerClass?: string;
}) => {
  const [layers, setLayers] = createSignal<HTMLElement | null>(null);
  const [frame, setFrame] = createSignal<HTMLElement | null>(null);
  const [back, setBack] = createSignal(0);
  const reduce = useReducedMotion();

  const recede = (on: boolean) =>
    setBack((n) => Math.max(0, n + (on ? 1 : -1)));

  return (
    <HostContext value={{ layers, frame, recede }}>
      <div
        ref={setFrame}
        class={`relative isolate overflow-hidden ${props.class ?? ""}`}
      >
        <div
          class="h-full w-full origin-top"
          ref={animated(
            () =>
              reduce()
                ? {}
                : { scale: back() ? 0.97 : 1, opacity: back() ? 0.92 : 1 },
            spring.soft
          )}
        >
          {props.children}
        </div>
        <div
          ref={setLayers}
          class={`pointer-events-none absolute inset-0 z-50 ${props.layerClass ?? ""}`}
        />
      </div>
    </HostContext>
  );
};

export const useMounted = () => () => true;

export const useHost = () => {
  const host = useContext(HostContext);

  return {
    contained: !!host,
    layers: host?.layers ?? (() => null),
    frame: host?.frame ?? (() => null),
    recede: (on: boolean) => host?.recede(on),
  };
};

export const Layer = (props: { children: JSX.Element }) => {
  const { contained, layers } = useHost();

  return (
    <>
      {contained && !layers() ? null : (
        <Portal mount={layers() ?? document.body}>{props.children}</Portal>
      )}
    </>
  );
};

export const fill = (contained: boolean) =>
  contained ? "absolute inset-0" : "fixed inset-0";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}

export const frameOf = (frame: HTMLElement | null) => {
  if (!frame) {
    return {
      left: 0,
      top: 0,
      width: innerWidth,
      height: innerHeight,
      scale: 1,
    };
  }

  const r = frame.getBoundingClientRect();

  return {
    left: r.left,
    top: r.top,
    width: frame.offsetWidth,
    height: frame.offsetHeight,
    scale: r.width / (frame.offsetWidth || r.width || 1),
  };
};

export const inFrame = (
  r: { left: number; top: number; width: number; height: number },
  f: Frame
) => ({
  x: (r.left - f.left) / f.scale,
  y: (r.top - f.top) / f.scale,
  w: r.width / f.scale,
  h: r.height / f.scale,
});

export type Side = "top" | "bottom" | "left" | "right";

export type Align = "start" | "center" | "end";

const OPPOSITE: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

const clampTo = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

const alignTo = (align: Align, start: number, length: number, size: number) => {
  if (align === "start") {
    return start;
  }

  if (align === "end") {
    return start + length - size;
  }

  return start + length / 2 - size / 2;
};

export const place = (
  anchor: Box,
  size: { w: number; h: number },
  frame: { width: number; height: number },
  want: Side,
  align: Align = "center",
  gap = 8,
  pad = 8
) => {
  const room: Record<Side, number> = {
    top: anchor.y,
    bottom: frame.height - anchor.y - anchor.h,
    left: anchor.x,
    right: frame.width - anchor.x - anchor.w,
  };

  const across = want === "top" || want === "bottom";
  const need = (across ? size.h : size.w) + gap + pad;

  const side =
    room[want] < need && room[OPPOSITE[want]] > room[want]
      ? OPPOSITE[want]
      : want;

  let x: number;
  let y: number;

  if (side === "top" || side === "bottom") {
    y = side === "bottom" ? anchor.y + anchor.h + gap : anchor.y - gap - size.h;
    x = alignTo(align, anchor.x, anchor.w, size.w);
    x = clampTo(x, pad, frame.width - pad - size.w);
    y = clampTo(y, pad, frame.height - pad - size.h);
  } else {
    x = side === "right" ? anchor.x + anchor.w + gap : anchor.x - gap - size.w;
    y = alignTo(align, anchor.y, anchor.h, size.h);
    y = clampTo(y, pad, frame.height - pad - size.h);
    x = clampTo(x, pad, frame.width - pad - size.w);
  }

  const arrow =
    side === "top" || side === "bottom"
      ? clampTo(anchor.x + anchor.w / 2 - x, 14, size.w - 14)
      : clampTo(anchor.y + anchor.h / 2 - y, 14, size.h - 14);

  return { x, y, side, arrow };
};

export const originOf = (side: Side, arrow: number) => {
  if (side === "bottom") {
    return `${arrow}px 0px`;
  }

  if (side === "top") {
    return `${arrow}px 100%`;
  }

  if (side === "right") {
    return `0px ${arrow}px`;
  }

  return `100% ${arrow}px`;
};

const open: object[] = [];

type El = () => HTMLElement | null | undefined;

export const useDismiss = (
  active: Accessor<boolean>,
  inside: El[],
  onDismiss: (why: "escape" | "outside") => void
) => {
  createEffect(active, (on) => {
    if (!on) {
      return;
    }

    const token = {};
    open.push(token);
    const top = () => open.at(-1) === token;

    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !top()) {
        return;
      }

      e.stopPropagation();
      onDismiss("escape");
    };

    const press = (e: PointerEvent) => {
      if (!top()) {
        return;
      }

      const t = e.target;

      if (t instanceof Node && inside.some((el) => el()?.contains(t))) {
        return;
      }

      onDismiss("outside");
    };

    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", press, true);

    return () => {
      open.splice(open.indexOf(token), 1);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", press, true);
    };
  });
};

const step = (i: number, count: number, back: boolean) => {
  if (back) {
    return i <= 0 ? count - 1 : i - 1;
  }

  return i === count - 1 ? 0 : i + 1;
};

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export const useFocusTrap = (
  box: El,
  active: Accessor<boolean>,
  quiet: Accessor<boolean>,
  first?: El
) => {
  const key = (e: KeyboardEvent) => {
    const root = box();

    if (e.key !== "Tab" || !root) {
      return;
    }

    const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null
    );

    if (!all.length) {
      return e.preventDefault();
    }

    const focused = document.activeElement;
    const i = focused instanceof HTMLElement ? all.indexOf(focused) : -1;

    const next = step(i, all.length, e.shiftKey);

    e.preventDefault();
    all[next]?.focus({ preventScroll: true });
  };

  createEffect(
    () => active() && !quiet(),
    (on) => {
      if (!on) {
        return;
      }

      const before = document.activeElement;

      const raf = requestAnimationFrame(() => {
        const el =
          first?.() ?? box()?.querySelector<HTMLElement>(FOCUSABLE) ?? box();

        el?.focus({ preventScroll: true });
      });

      document.addEventListener("keydown", key);

      return () => {
        cancelAnimationFrame(raf);
        document.removeEventListener("keydown", key);

        if (
          (before instanceof HTMLElement || before instanceof SVGElement) &&
          before.isConnected
        ) {
          before.focus({ preventScroll: true });
        }
      };
    }
  );
};

let locks = 0;

export const useScrollLock = (active: Accessor<boolean>) => {
  createEffect(active, (on) => {
    if (!on) {
      return;
    }

    const html = document.documentElement;

    locks += 1;

    if (locks === 1) {
      const bar = innerWidth - html.clientWidth;
      html.style.overflow = "hidden";

      if (bar) {
        html.style.paddingRight = `${bar}px`;
      }
    }

    return () => {
      locks -= 1;

      if (locks === 0) {
        html.style.overflow = "";
        html.style.paddingRight = "";
      }
    };
  });
};

export const useReposition = (active: Accessor<boolean>, fn: () => void) => {
  createEffect(active, (on) => {
    if (!on) {
      return;
    }

    addEventListener("resize", fn);
    addEventListener("scroll", fn, true);

    return () => {
      removeEventListener("resize", fn);
      removeEventListener("scroll", fn, true);
    };
  });
};
