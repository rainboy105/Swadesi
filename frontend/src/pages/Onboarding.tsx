import { useState } from "react";
import { api, type Me } from "../lib/api";

/**
 * First-login details: name + the location used for all vicinity searches
 * (for a cook it is the kitchen; for a consumer, home).
 */
export default function Onboarding({ onDone }: { onDone: (me: Me) => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [addressEdited, setAddressEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Turn lat/lng into a readable address via our own backend (no blocker/CORS issues). */
  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const { address } = await api.reverseGeocode(lat, lng);
      return address && address.trim() ? address : null;
    } catch {
      return null;
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Location is not available in this browser. You can still type your address.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        // Auto-fill the address unless the user has already typed their own.
        if (!addressEdited) {
          const resolved = await reverseGeocode(lat, lng);
          if (resolved && !addressEdited) setAddress(resolved);
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Could not get your location. Please allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    if (!name.trim()) return setError("Please tell us your name.");
    if (!address.trim()) return setError("Please enter your address (flat, building, society).");
    if (!coords) return setError('Please tap "Use my location" — we need it to show food near you.');
    setBusy(true);
    setError(null);
    try {
      const me = await api.onboard(name.trim(), address.trim(), coords.lat, coords.lng);
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
        <div className="logo-box">🍲 Swadesi</div>
        <h2>Almost there</h2>
        <p>Tell us who you are and where you live</p>
      </div>
      <div className="card">
      <span className="chip">📍 Food near you, within walking distance</span>

      <label htmlFor="name">Your name</label>
      <input
        id="name"
        placeholder="e.g. Asha Sharma"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />

      <label htmlFor="address">Address (flat, building, society)</label>
      <input
        id="address"
        placeholder="A-402, Green Meadows, Baner"
        value={address}
        onChange={(e) => {
          setAddress(e.target.value);
          setAddressEdited(true);
        }}
      />
      <p className="hint">
        Tap below and we'll fill this from your location — add your flat & building to it.
      </p>

      <button className="secondary" disabled={locating} onClick={useMyLocation}>
        {locating
          ? "Locating…"
          : coords
            ? "✓ Location captured — tap to refresh"
            : "📍 Use my location & fill address"}
      </button>

      <button disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Finish"}
      </button>

      {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
