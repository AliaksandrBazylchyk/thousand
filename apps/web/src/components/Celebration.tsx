import { useEffect, useRef, useState } from 'react';

const COLORS = ['#ffd54f', '#ff6b6b', '#46b383', '#3987e5', '#e87ba4', '#ffffff'];
const DURATION_MS = 4500;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
}

/**
 * Праздник на весь экран: конфетти и крупная надпись. Запускается при каждом новом значении
 * trigger (0 — ничего не показывать). При «уменьшенном движении» конфетти не летят.
 */
export function Celebration({ trigger, text }: { trigger: number; text: string }) {
  // Видно, пока не истёк таймер для текущего trigger.
  const [finished, setFinished] = useState(0);
  const visible = trigger !== 0 && finished !== trigger;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (trigger === 0) return;
    const hide = window.setTimeout(() => setFinished(trigger), DURATION_MS);
    return () => window.clearTimeout(hide);
  }, [trigger]);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const w = () => canvas.width;
    const h = () => canvas.height;
    const pieces: Piece[] = Array.from({ length: 260 }, () => ({
      x: Math.random() * w(),
      y: -Math.random() * h() * 0.6,
      vx: (Math.random() - 0.5) * 4 * dpr,
      vy: (2 + Math.random() * 4) * dpr,
      size: (8 + Math.random() * 10) * dpr,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    }));

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w(), h());
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04 * dpr;
        p.rotation += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="celebration" role="alert" aria-live="assertive">
      <canvas ref={canvasRef} className="celebration-canvas" />
      <div key={trigger} className="celebration-text">
        {text}
      </div>
    </div>
  );
}
