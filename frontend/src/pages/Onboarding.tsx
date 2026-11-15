import { useState } from "react";
import { api, type Me } from "../lib/api";
import LocationPicker, { type PickedLocation } from "../components/LocationPicker";

/**
 * First-login details: name + the location used for all vicinity searches
 * (for a cook it is the kitchen; for a consumer, home).
 *
 * Address is two lines: line 1 (flat/building) typed by the user, line 2 (area,
 * city, state, pincode) auto-filled from GPS but editable.
 */
export default function Onboarding({ onDone }: { onDone: (me: Me) => void }) {
  const [name, setName] = useState("");
  const [flat, setFlat] = useState(""); // line 1 — flat, building, society
  const [area, setArea] = useState(""); // line 2 — area, city, state, pincode
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = (p: PickedLocation) => {
    setCoords({ lat: p.lat, lng: p.lng });
    if (p.address) setArea(p.address); // fill line 2
  };

  const save = async () => {
    if (!name.trim()) return setError("Please tell us your name.");
    if (!flat.trim()) return setError("Please enter your flat / building / society.");
    if (!area.trim()) return setError("Please add your area — tap “Use my location” or type it.");
    if (!coords) return setError('Please tap "Use my location" — we need it to show food near you.');
    setBusy(true);
    setError(null);
    try {
      const addressText = `${flat.trim()}, ${area.trim()}`;
      const me = await api.onboard(name.trim(), addressText, coords.lat, coords.lng);
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
        <p>Tell us who you are and where you live</p>
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

        <label htmlFor="flat">Flat / building / society <span className="req">*</span></label>
        <input
          id="flat"
          placeholder="e.g. A-402, Green Meadows"
          value={flat}
          onChange={(e) => setFlat(e.target.value)}
        />

        <label htmlFor="area">Area, city, state, pincode <span className="req">*</span></label>
        <input
          id="area"
          placeholder="Filled from the map"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />

        <label>Pin your society on the map <span className="req">*</span></label>
        <LocationPicker value={coords ? { ...coords, address: area } : null} onChange={onPick} />

        <button disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Finish"}
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
