import { createEffect } from "solid-js";
import { MODE_FRAMES, paintFrame, resolvePreset } from "thinking-orbs/engine";
import type { OrbSize, OrbState } from "thinking-orbs/engine";

import { useReducedMotion } from "@/lib/motion";
import { useTheme } from "@/lib/theme";

export const ThinkingOrb = (props: { state?: OrbState; size?: OrbSize }) => {
  let canvas!: HTMLCanvasElement;
  const { dark: isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const orbState = () => props.state ?? "working";
  const orbSize = () => props.size ?? 64;

  createEffect(
    () => ({
      state: orbState(),
      size: orbSize(),
      dark: isDark(),
      reduced: reducedMotion(),
    }),
    ({ state, size, dark, reduced }) => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return;
      }

      const { mode, speed, opts } = resolvePreset(state, size);

      const frame = (seconds: number) => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        paintFrame(ctx, MODE_FRAMES[mode](size, seconds, opts), dark);
      };

      if (reduced) {
        frame(0.6);

        return;
      }

      let raf = 0;
      let running = false;

      const loop = () => {
        frame((performance.now() / 1000) * speed);

        if (running) {
          raf = requestAnimationFrame(loop);
        }
      };

      const start = () => {
        if (running) {
          return;
        }

        running = true;
        raf = requestAnimationFrame(loop);
      };

      const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
      };

      frame((performance.now() / 1000) * speed);
      let visible = true;

      const observer = new IntersectionObserver(([entry]) => {
        if (!entry) {
          return;
        }

        visible = entry.isIntersecting;

        if (visible && document.visibilityState !== "hidden") {
          start();
        } else {
          stop();
        }
      });

      observer.observe(canvas);

      const onVisibility = () => {
        if (document.visibilityState === "hidden") {
          stop();
        } else if (visible) {
          start();
        }
      };

      document.addEventListener("visibilitychange", onVisibility);

      return () => {
        stop();
        observer.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
  );

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      style={{
        width: `${orbSize()}px`,
        height: `${orbSize()}px`,
        display: "block",
      }}
    />
  );
};
