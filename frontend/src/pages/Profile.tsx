import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken, type Me } from "../lib/api";
import AppHeader from "../components/AppHeader";

/** The /profile page: view details, edit name/address/location, and log out. */
export default function Profile({ me, onMe, onLogout }: {
  me: Me;
  onMe: (me: Me) => void;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name ?? "");
  const [address, setAddress] = useState(me.addressText ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: me.lat ?? 0,
    lng: me.lng ?? 0,
  });
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = () => {
    setToken(null);
    onLogout();
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError("Location isn't available in this browser.");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        try {
          const { address: resolved } = await api.reverseGeocode(lat, lng);
          if (resolved) setAddress(resolved);
        } catch {
          /* keep coords */
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Could not get your location. Please allow access and try again.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    if (!name.trim()) return setError("Please enter your name.");
    if (!address.trim()) return setError("Please enter your address.");
    setBusy(true);
    setError(null);
    try {
      const updated = await api.onboard(name.trim(), address.trim(), coords.lat, coords.lng);
      onMe(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader
        title="Your profile"
        subtitle={me.activeRole === "cook" ? "Cook mode" : "Consumer mode"}
        showProfile={false}
        onBack={() => navigate("/")}
      />
      <div className="card">
        <span className="tile">🙂</span>

        {!editing ? (
          <>
            <div className="profile">
              <div className="profile-row">
                <span>Name</span>
                <strong>{me.name || "—"}</strong>
              </div>
              <div className="profile-row">
                <span>Phone</span>
                <strong>{me.phone}</strong>
              </div>
              <div className="profile-row">
                <span>Address</span>
                <strong>{me.addressText || "—"}</strong>
              </div>
              <div className="profile-row">
                <span>Current mode</span>
                <strong>{me.activeRole === "cook" ? "🍳 Cook" : "🍽️ Consumer"}</strong>
              </div>
            </div>
            <button onClick={() => setEditing(true)}>Edit name & address</button>
            <button className="link" onClick={() => navigate("/")}>Back to home</button>
            <button className="link" onClick={logout}>Log out</button>
          </>
        ) : (
          <>
            <label htmlFor="pname">Your name</label>
            <input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
            <label htmlFor="paddr">Address</label>
            <input id="paddr" value={address} onChange={(e) => setAddress(e.target.value)} />
            <button className="secondary" disabled={locating} onClick={useMyLocation}>
              {locating ? "Locating…" : "📍 Update location from GPS"}
            </button>
            <button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
            <button className="link" onClick={() => {
              setEditing(false);
              setName(me.name ?? "");
              setAddress(me.addressText ?? "");
              setError(null);
            }}>Cancel</button>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
