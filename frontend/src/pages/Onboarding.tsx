import { useState } from "react";
import { api, type Me } from "../lib/api";
import LocationPicker, { type PickedLocation } from "../components/LocationPicker";

/**
 * First-login details: name + location picked on a map (search, tap/drag the pin, or the
 * on-map "my location" control). We store the exact coordinates and a readable area label.
 */
export default function Onboarding({ onDone }: { onDone: (me: Me) => void }) {
  const [name, setName] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = (p: PickedLocation) => {
    setCoords({ lat: p.lat, lng: p.lng });
    setArea(p.address ?? null);
  };

  const save = async () => {
    if (!name.trim()) return setError("Please tell us your name.");
    if (!coords) return setError("Please set your location on the map.");
    setBusy(true);
    setError(null);
    try {
      const me = await api.onboard(name.trim(), coords.lat, coords.lng, area);
      onDone(me);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hero">
        <div className="logo-box">🍲 Swaadesi</div>
        <h2>Almost there</h2>
        <p>Tell us your name and set your location</p>
      </div>
      <div className="card">
        <span className="chip">📍 Food near you, within walking distance</span>

        <label htmlFor="name">Your name <span className="req">*</span></label>
        <input
          id="name"
          placeholder="e.g. Asha Sharma"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />

        <label>Your location <span className="req">*</span></label>
        <LocationPicker value={coords ? { ...coords, address: area } : null} onChange={onPick} />
        <p className="hint">Search, tap the map, or use the 📍 button. We use this only to show home-cooked food near you.</p>

        <button disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Finish"}
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
