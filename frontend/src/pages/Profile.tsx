import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken, type Me } from "../lib/api";
import AppHeader from "../components/AppHeader";
import RadiusSlider from "../components/RadiusSlider";

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
          setAddress(address && address.trim() ? address : "");
        } catch {
          /* keep existing */
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

  const changeRadius = async (m: number) => {
    try {
      onMe(await api.setRadius(m));
    } catch {
      /* ignore */
    }
  };

  const save = async () => {
    if (!name.trim()) return setError("Please enter your name.");
    if (!coords.lat && !coords.lng) return setError('Please tap "Use my current location".');
    setBusy(true);
    setError(null);
    try {
      const updated = await api.onboard(name.trim(), coords.lat, coords.lng, address.trim() || null);
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
        <div className="profile-head">
          <span className="tile">🙂</span>
          {!editing && (
            <button className="icon-btn" aria-label="Edit profile" onClick={() => setEditing(true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
        </div>

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
            <div className="profile-radius">
              <RadiusSlider value={me.searchRadiusM} onChange={changeRadius} />
            </div>
            {me.admin && (
              <button className="secondary" onClick={() => navigate("/admin/settlements")}>
                💸 Cook settlements
              </button>
            )}
            <button className="link" onClick={() => navigate("/")}>Back to home</button>
            <button className="link" onClick={logout}>Log out</button>
          </>
        ) : (
          <>
            <label htmlFor="pname">Your name <span className="req">*</span></label>
            <input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
            <label>Your location (feed is centered here) <span className="req">*</span></label>
            <button type="button" className="secondary" disabled={locating} onClick={useLocation}>
              {locating ? "Locating…" : "📍 Use my current location"}
            </button>
            <p className="loc-ok">
              ✓ {address || (coords.lat || coords.lng ? "Location set" : "No location yet")}
            </p>
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
