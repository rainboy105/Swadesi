import { useEffect, useState } from "react";
import { radiusLabel } from "../lib/api";

const MIN = 500;
const MAX = 5000;
const STEP = 500;
const STEPS = Math.round((MAX - MIN) / STEP); // number of gaps between ticks

/**
 * Slide to set the vicinity search radius. Tick "checkpoints" mark each step and a
 * value bubble rides above the thumb. Commits (calls onChange) only on release, so
 * we don't fire an API call on every pixel of drag.
 */
export default function RadiusSlider({ value, onChange }: {
  value: number;
  onChange: (m: number) => void;
}) {
  const [v, setV] = useState(value);
  // Keep the thumb in sync if the value changes elsewhere (e.g. after reload).
  useEffect(() => setV(value), [value]);

  const frac = (v - MIN) / (MAX - MIN); // 0..1
  const pct = (f: number) => `${f * 100}%`;
  // The thumb centre travels inset by half its width (12px); the bubble follows it.
  const bubbleAt = `calc(12px + ${frac} * (100% - 24px))`;

  return (
    <div className="rs-wrap">
      {/* value bubble above the thumb */}
      <div className="rs-bubble" style={{ left: bubbleAt }}>{radiusLabel(v)}</div>

      {/* track spans exactly from the first point to the last point */}
      <div className="rs-track">
        <div className="rs-fill" style={{ width: pct(frac) }} />
        {Array.from({ length: STEPS + 1 }, (_, i) => {
          const f = i / STEPS;
          return (
            <span
              key={i}
              className={`rs-tick ${f <= frac + 1e-6 ? "on" : ""}`}
              style={{ left: pct(f) }}
            />
          );
        })}
      </div>

      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onMouseUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        aria-label="Search radius"
      />

      <div className="rs-scale">
        <span>{radiusLabel(MIN)}</span>
        <span>{radiusLabel(MAX)}</span>
      </div>
    </div>
  );
}
