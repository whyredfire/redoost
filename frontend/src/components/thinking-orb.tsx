import { createEffect } from "solid-js";
import {
  MODE_FRAMES,
  paintFrame,
  resolvePreset,
  type OrbSize,
  type OrbState,
} from "thinking-orbs/engine";
import { useReducedMotion } from "@/lib/motion";
import { useTheme } from "@/lib/theme";

const labels: Record<OrbState, string> = {
  working: "Working…",
  searching: "Searching…",
  solving: "Solving…",
  listening: "Listening…",
  connecting: "Connecting…",
  weaving: "Weaving…",
  composing: "Composing…",
  breathing: "Thinking…",
  shaping: "Shaping…",
};

// thinking-orbs' ThinkingOrb is React-only, so this drives its engine the same way, with only the props used here
export function ThinkingOrb(props: { state?: OrbState; size?: OrbSize }) {
  let canvas!: HTMLCanvasElement;
  // The package reads the .dark class the theme puts on <html>
  const { dark } = useTheme();
  const reduced = useReducedMotion();
  const state = () => props.state ?? "working";
  const size = () => props.size ?? 64;

  createEffect(
    () => ({ state: state(), size: size(), dark: dark(), reduced: reduced() }),
    ({ state, size, dark, reduced }) => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { mode, speed, opts } = resolvePreset(state, size);
      const frame = (seconds: number) => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        paintFrame(ctx, MODE_FRAMES[mode](size, seconds, opts), dark);
      };
      // Reduced motion gets a still frame
      if (reduced) {
        frame(0.6);
        return;
      }
      let raf = 0;
      let running = false;
      const loop = () => {
        frame((performance.now() / 1000) * speed);
        if (running) raf = requestAnimationFrame(loop);
      };
      const start = () => {
        if (running) return;
        running = true;
        raf = requestAnimationFrame(loop);
      };
      const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
      };
      frame((performance.now() / 1000) * speed);
      // Paused while offscreen or in a hidden tab
      let visible = true;
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry!.isIntersecting;
        if (visible && document.visibilityState !== "hidden") start();
        else stop();
      });
      observer.observe(canvas);
      const onVisibility = () => {
        if (document.visibilityState === "hidden") stop();
        else if (visible) start();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        stop();
        observer.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
      };
    },
  );

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={labels[state()]}
      style={{ width: `${size()}px`, height: `${size()}px`, display: "block" }}
    />
  );
}
