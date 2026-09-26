import { cn } from "cn";
import { useEffect, useRef, type ComponentProps } from "react";

const TWO_PI = Math.PI * 2;

type Dot = {
  // Anchor, smoothed and pushed positions, plus velocity for the push mode
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type DotFieldProps = ComponentProps<"div"> & {
  dotRadius?: number;
  dotSpacing?: number;
  cursorRadius?: number;
  cursorForce?: number;
  bulgeOnly?: boolean;
  bulgeStrength?: number;
  glowRadius?: number;
  sparkle?: boolean;
  waveAmplitude?: number;
  // "currentColor" and var(--name) are read from CSS, so they follow the theme
  gradientFrom?: string;
  gradientTo?: string;
  glowColor?: string;
};

export function DotField({
  dotRadius = 1.5,
  dotSpacing = 14,
  cursorRadius = 500,
  cursorForce = 0.1,
  bulgeOnly = true,
  bulgeStrength = 67,
  glowRadius = 160,
  sparkle = false,
  waveAmplitude = 0,
  gradientFrom = "currentColor",
  gradientTo = "currentColor",
  glowColor = "currentColor",
  className,
  ...rest
}: DotFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const style = getComputedStyle(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 };
    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let engagement = 0;
    let frame = 0;
    let raf = 0;
    let moving = false;
    // Colours of the last drawn frame; empty forces a redraw
    let drawn = "";

    function resize() {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildDots();
      drawn = "";
    }

    function buildDots() {
      const step = dotRadius + dotSpacing;
      const cols = Math.floor(width / step);
      const rows = Math.floor(height / step);
      const padX = (width % step) / 2;
      const padY = (height % step) / 2;
      dots = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const ax = padX + col * step + step / 2;
          const ay = padY + row * step + step / 2;
          dots.push({ ax, ay, sx: ax, sy: ay, x: ax, y: ay, vx: 0, vy: 0 });
        }
      }
    }

    // Measured on every move, so layout shifts and scrolling don't skew it
    function onMouseMove(event: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    }

    function updateMouseSpeed() {
      const dx = mouse.prevX - mouse.x;
      const dy = mouse.prevY - mouse.y;
      mouse.speed += (Math.sqrt(dx * dx + dy * dy) - mouse.speed) * 0.5;
      if (mouse.speed < 0.001) mouse.speed = 0;
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
    }

    function resolve(color: string) {
      if (color === "currentColor") return style.color;
      const variable = color.match(/^var\((--[\w-]+)\)$/);
      return variable ? style.getPropertyValue(variable[1]!).trim() : color;
    }

    function tick() {
      raf = requestAnimationFrame(tick);
      frame++;

      engagement += (Math.min(mouse.speed / 5, 1) - engagement) * 0.06;
      if (engagement < 0.001) engagement = 0;
      const from = resolve(gradientFrom);
      const to = resolve(gradientTo);
      const glow = resolve(glowColor);
      const colors = `${from} ${to} ${glow}`;
      const animated = sparkle || waveAmplitude > 0;
      if (!moving && engagement === 0 && !animated && colors === drawn) return;
      drawn = colors;

      const t = frame * 0.02;
      const radiusSq = cursorRadius * cursorRadius;
      const rad = dotRadius / 2;
      // Dots near the cursor, drawn again on top in the glow colour
      const glowing: { x: number; y: number; strength: number }[] = [];
      moving = false;

      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, from);
      gradient.addColorStop(1, to);
      ctx.fillStyle = gradient;
      ctx.beginPath();

      for (const [i, d] of dots.entries()) {
        const dx = mouse.x - d.ax;
        const dy = mouse.y - d.ay;
        const distSq = dx * dx + dy * dy;

        if (distSq < radiusSq && engagement > 0.01) {
          const dist = Math.sqrt(distSq);
          const angle = Math.atan2(dy, dx);
          if (bulgeOnly) {
            const falloff = 1 - dist / cursorRadius;
            const push = falloff * falloff * bulgeStrength * engagement;
            d.sx += (d.ax - Math.cos(angle) * push - d.sx) * 0.15;
            d.sy += (d.ay - Math.sin(angle) * push - d.sy) * 0.15;
          } else {
            const move = (500 / dist) * (mouse.speed * cursorForce);
            d.vx -= Math.cos(angle) * move;
            d.vy -= Math.sin(angle) * move;
          }
        } else if (bulgeOnly) {
          d.sx += (d.ax - d.sx) * 0.1;
          d.sy += (d.ay - d.sy) * 0.1;
        }

        if (!bulgeOnly) {
          d.vx *= 0.9;
          d.vy *= 0.9;
          d.x = d.ax + d.vx;
          d.y = d.ay + d.vy;
          d.sx += (d.x - d.sx) * 0.1;
          d.sy += (d.y - d.sy) * 0.1;
        }
        if (Math.abs(d.sx - d.ax) > 0.01 || Math.abs(d.sy - d.ay) > 0.01) {
          moving = true;
        }

        let x = d.sx;
        let y = d.sy;
        if (waveAmplitude > 0) {
          y += Math.sin(d.ax * 0.03 + t) * waveAmplitude;
          x += Math.cos(d.ay * 0.03 + t * 0.7) * waveAmplitude * 0.5;
        }
        // A few dots at a time sparkle a little larger
        const hash = ((i * 2654435761) ^ (frame >> 3)) >>> 0;
        const r = sparkle && hash % 100 < 3 ? rad * 1.8 : rad;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TWO_PI);

        const glowDist = Math.sqrt(distSq);
        if (engagement > 0.01 && glowDist < glowRadius) {
          glowing.push({
            x,
            y,
            strength: (1 - glowDist / glowRadius) * engagement,
          });
        }
      }

      ctx.fill();

      ctx.fillStyle = glow;
      ctx.shadowColor = glow;
      for (const dot of glowing) {
        ctx.globalAlpha = dot.strength * 0.5;
        ctx.shadowBlur = 3 * dot.strength;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, rad, 0, TWO_PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const speedTimer = setInterval(updateMouseSpeed, 20);
    // Under reduced motion the cursor is ignored, so the dots stay still
    if (!still) {
      window.addEventListener("mousemove", onMouseMove, { passive: true });
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(speedTimer);
      observer.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [
    dotRadius,
    dotSpacing,
    cursorRadius,
    cursorForce,
    bulgeOnly,
    bulgeStrength,
    sparkle,
    waveAmplitude,
    gradientFrom,
    gradientTo,
    glowRadius,
    glowColor,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn("relative size-full", className)}
      {...rest}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
