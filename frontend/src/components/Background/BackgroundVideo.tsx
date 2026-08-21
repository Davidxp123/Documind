'use client';

import { useEffect, useRef } from 'react';

/**
 * BackgroundVideo — renders an animated dark-gradient canvas background.
 *
 * The previous implementation relied on a Mux HLS stream that was unavailable.
 * This version uses a pure Canvas 2D animation — no network dependency, no codec
 * issues, works on every route on first load, in any browser.
 *
 * Visual: slow-drifting dark purple/black gradient blobs, subtle and unobtrusive.
 */
export default function BackgroundVideo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to viewport
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Blob definitions — slow-moving radial gradient orbs
    const blobs = [
      { x: 0.15, y: 0.2,  r: 0.45, dx: 0.00012, dy: 0.00008,  color: [60, 20, 100] },
      { x: 0.75, y: 0.65, r: 0.50, dx: -0.00009, dy: 0.00011, color: [30, 10, 80]  },
      { x: 0.50, y: 0.85, r: 0.40, dx: 0.00007,  dy: -0.00010, color: [80, 15, 120] },
      { x: 0.85, y: 0.15, r: 0.35, dx: -0.00011, dy: 0.00007,  color: [20, 5,  60]  },
    ] as { x: number; y: number; r: number; dx: number; dy: number; color: number[] }[];

    let t = 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Deep black base
      ctx.fillStyle = '#000005';
      ctx.fillRect(0, 0, W, H);

      // Draw each blob as a radial gradient
      for (const blob of blobs) {
        // Drift position (wrap around 0..1)
        blob.x = ((blob.x + blob.dx + 1) % 1);
        blob.y = ((blob.y + blob.dy + 1) % 1);

        const cx = blob.x * W;
        const cy = blob.y * H;
        const radius = blob.r * Math.max(W, H);

        // Pulse radius slightly with time
        const pulsed = radius * (1 + 0.04 * Math.sin(t * 0.8 + blob.r * 10));

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulsed);
        const [r, g, b] = blob.color;
        grad.addColorStop(0,   `rgba(${r}, ${g}, ${b}, 0.18)`);
        grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.07)`);
        grad.addColorStop(1,   `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      t += 0.016; // ~60fps time step
      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 w-full h-full"
      style={{ zIndex: -1 }}
    />
  );
}
