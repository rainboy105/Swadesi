import { useEffect, useState } from "react";
import { radiusLabel } from "../lib/api";

const MIN = 500;
const MAX = 5000;
const STEP = 500;

/**
 * Slide to set the vicinity search radius. Commits (calls onChange) only when the
 * user releases the thumb, so we don't fire an API call on every pixel of drag.
 */
export default function RadiusSlider({ value, onChange }: {
  value: number;
  onChange: (m: number) => void;
}) {
  const [v, setV] = useState(value);
  // Keep the thumb in sync if the value changes elsewhere (e.g. after reload).
  useEffect(() => setV(value), [value]);

  const pct = ((v - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="radius-slider">
      <div className="radius-slider-head">
        <span className="muted">Search within</span>
        <strong className="radius-value">{radiusLabel(v)}</strong>
      </div>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={v}
        style={{ background: `linear-gradient(to right, var(--violet-600) ${pct}%, var(--line) ${pct}%)` }}
        onChange={(e) => setV(Number(e.target.value))}
        onMouseUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        aria-label="Search radius"
      />
      <div className="radius-scale">
        <span>{radiusLabel(MIN)}</span>
        <span>{radiusLabel(MAX)}</span>
      </div>
    </div>
  );
}
