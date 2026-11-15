import { useState } from "react";
import { api, type Me } from "../lib/api";

/**
 * First-login details: name + current location (one tap). No typed address —
 * we just capture GPS and auto-fill a readable area name from it for display.
 */
export default function Onboarding({ onDone }: { onDone: (me: Me) => void }) {
  const [name, setName] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useLocation = () => {
    if (!navigator.geolocation) return setError("Location isn't available on this device.");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCoords({ lat, lng });
        try {
          const { address } = await api.reverseGeocode(lat, lng);
          setArea(address && address.trim() ? address : null);
        } catch {
          setArea(null);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Please allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    if (!name.trim()) return setError("Please tell us your name.");
    if (!coords) return setError('Please tap "Use my current location" so we can show food near you.');
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
        <button type="button" className="secondary" disabled={locating} onClick={useLocation}>
          {locating ? "Locating…" : coords ? "📍 Update my location" : "📍 Use my current location"}
        </button>
        {coords && (
          <p className="loc-ok">✓ Location set{area ? ` — ${area}` : ""}</p>
        )}
        <p className="hint">We use this only to show home-cooked food near you.</p>

        <button disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Finish"}
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
