// Reusable visual building blocks: the split meter, confetti, label parsing, hooks.
import { useEffect, useRef, useState } from 'react';
import { sfx } from './sfx';

// ---------------------------------------------------------------------------
// Labels: "🍍 Belongs there" -> { emoji: '🍍', text: 'Belongs there' }
// ---------------------------------------------------------------------------
const EMOJI_PREFIX =
  /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}️‍]|[0-9#*]️?⃣)+)\s*(.*)$/u;

export function splitLabel(label: string): { emoji: string | null; text: string } {
  const m = EMOJI_PREFIX.exec(label);
  if (!m || !m[2]) return { emoji: null, text: label };
  return { emoji: m[1]!, text: m[2] };
}

// ---------------------------------------------------------------------------
// Motion helpers
// ---------------------------------------------------------------------------
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Eased number tween. Starts at `from`, lands on `to`. */
export function useCountUp(to: number, durationMs: number, from = 0, delayMs = 0): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let raf = 0;
    let start = 0;
    const timer = setTimeout(() => {
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / durationMs);
        setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [to, durationMs, from, delayMs]);
  return value;
}

/** Light haptic tap where supported (Android webviews). */
export const buzz = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
};

// ---------------------------------------------------------------------------
// Split meter: the core visual of the game
// ---------------------------------------------------------------------------
type MeterProps = {
  a: string;
  b: string;
  /** Fill for side A, 0..100 */
  pct: number;
  /** Number shown in the labels (lets the reveal count up independently). */
  shownPct?: number;
  /** Player's guess marker (reveal mode). */
  guess?: number;
  /** Interactive mode: renders a draggable, keyboard-accessible slider. */
  onChange?: (v: number) => void;
  pending?: boolean;
  settled?: boolean;
};

export function Meter({ a, b, pct, shownPct, guess, onChange, pending, settled }: MeterProps) {
  const label = Math.round(shownPct ?? pct);
  const la = splitLabel(a);
  const lb = splitLabel(b);
  const interactive = Boolean(onChange);
  const delta = guess !== undefined ? Math.abs(Math.round(guess) - Math.round(pct)) : 0;

  return (
    <div className={`meter ${interactive ? 'is-interactive' : ''} ${pending ? 'is-pending' : ''}`}>
      <div className="meter-labels">
        <span className="side a">
          <span className="side-name">{la.emoji} {la.text}</span>
          <span className="side-pct">{label}%</span>
        </span>
        <span className="side b">
          <span className="side-pct">{100 - label}%</span>
          <span className="side-name">{lb.emoji} {lb.text}</span>
        </span>
      </div>

      <div className="meter-body">
        <div className="meter-track">
          <div className="meter-a" style={{ width: `${pct}%` }} />
          {pending && <div className="meter-shimmer" />}
        </div>

        {interactive && (
          <>
            <div className="meter-thumb" style={{ left: `${pct}%` }}>
              <span className="thumb-grip" />
            </div>
            <input
              className="meter-input"
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v % 10 === 0) {
                  buzz(6);
                  sfx.tick();
                }
                onChange!(v);
              }}
              aria-label={`Percent of the room choosing ${la.text}`}
              aria-valuetext={`${label}% ${la.text}, ${100 - label}% ${lb.text}`}
            />
          </>
        )}

        {guess !== undefined && (
          <>
            {settled && delta > 0 && (
              <div
                className="meter-gap"
                style={{ left: `${Math.min(guess, pct)}%`, width: `${Math.abs(guess - pct)}%` }}
              />
            )}
            <div className="meter-guess" style={{ left: `${guess}%` }}>
              <span className="guess-tag">YOU {Math.round(guess)}%</span>
            </div>
          </>
        )}
      </div>

      {interactive && (
        <div className="meter-ticks" aria-hidden>
          {[0, 25, 50, 75, 100].map((t) => (
            <span key={t} style={{ left: `${t}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confetti: tiny dependency-free canvas burst
// ---------------------------------------------------------------------------
const CONFETTI_COLORS = ['#ff6a3d', '#22c7b8', '#ffd23f', '#ff4f8b', '#9b8cff', '#ffffff'];

export function Confetti({ fire, pieces = 110 }: { fire: boolean; pieces?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire || prefersReducedMotion()) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.offsetWidth * dpr);
    const h = (canvas.height = canvas.offsetHeight * dpr);
    const parts = Array.from({ length: pieces }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.45,
      vx: (Math.random() - 0.5) * 14 * dpr,
      vy: (-Math.random() * 14 - 6) * dpr,
      r: (Math.random() * 5 + 3) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
    }));
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 1800);
      for (const p of parts) {
        p.vy += 0.45 * dpr;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      }
      if (elapsed < 1800) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire, pieces]);
  return <canvas ref={ref} className="confetti" aria-hidden />;
}
