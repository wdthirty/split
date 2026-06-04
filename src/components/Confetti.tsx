"use client";

import { useEffect, useRef } from "react";

// Lightweight, dependency-free confetti burst. Renders a fixed full-screen
// canvas, animates a one-shot shower of particles, then calls onDone so the
// parent can unmount it. Pointer-events-none so it never blocks the UI.
// `big` = a longer, denser shower for milestone moments (fully settled up).
const COLORS = ["#3ddc84", "#22c55e", "#a6f4c5", "#c2cad3", "#f5d90a", "#ff7eb6"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vrot: number;
};

export function Confetti({ big = false, onDone }: { big?: boolean; onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particleCount = big ? 240 : 130;
    const durationMs = big ? 4200 : 3200;

    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Launch particles from the top, fanning out and drifting down under a
    // gentle gravity (tuned slow so it floats rather than drops).
    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: -20 - Math.random() * H * 0.3,
      vx: (Math.random() - 0.5) * 3,
      vy: 0.6 + Math.random() * 2,
      size: 6 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.18,
    }));

    let raf = 0;
    let start = 0;

    const frame = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      ctx.clearRect(0, 0, W, H);

      // Fade the whole layer out over the final third so it doesn't pop away.
      const fade =
        elapsed > durationMs * 0.66
          ? Math.max(0, 1 - (elapsed - durationMs * 0.66) / (durationMs * 0.34))
          : 1;
      ctx.globalAlpha = fade;

      for (const p of particles) {
        p.vy += 0.05; // gentle gravity — slower fall
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      if (elapsed < durationMs) {
        raf = requestAnimationFrame(frame);
      } else {
        onDone?.();
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [big, onDone]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[60]"
      aria-hidden="true"
    />
  );
}
