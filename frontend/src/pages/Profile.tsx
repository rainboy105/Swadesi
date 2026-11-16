import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken, type Me, type Role } from "../lib/api";
import AppHeader from "../components/AppHeader";
import { downscaleToJpeg } from "../lib/image";
import { enablePush, disablePush, isPushEnabled, pushPermission } from "../lib/push";

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

  // Push notifications.
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const pushState = pushPermission();

  useEffect(() => {
    isPushEnabled().then(setPushOn).catch(() => setPushOn(false));
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        await enablePush();
        setPushOn(true);
      }
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : "Could not change notifications.");
    } finally {
      setPushBusy(false);
    }
  };

  // Profile photo.
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarVer, setAvatarVer] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const onAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    setError(null);
    try {
      onMe(await api.uploadAvatar(await downscaleToJpeg(file)));
      setAvatarVer((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update photo.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const [switching, setSwitching] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const switchTo = async (next: Role) => {
    setSheetOpen(false);
    if (next === me.activeRole || switching) return;
    setSwitching(true);
    try {
      onMe(await api.setRole(next));
    } catch {
      /* keep current mode on failure */
    } finally {
      setSwitching(false);
    }
  };

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
        title=""
        showProfile={false}
        onBack={() => navigate("/")}
      />
      <div className="card">
        <div className="avatar-block">
          <button className="avatar" onClick={() => fileRef.current?.click()}
                  disabled={avatarBusy} aria-label="Change profile photo">
            {me.hasAvatar ? (
              <img src={`${api.avatarUrl(me.id)}?v=${avatarVer}`} alt="Profile" />
            ) : (
              <span className="avatar-default" aria-hidden="true">
                {me.activeRole === "cook" ? "🧑‍🍳" : "🙂"}
              </span>
            )}
            <span className="avatar-cam" aria-hidden="true">
              {avatarBusy ? "…" : "📷"}
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarPick} />
          {me.name && <div className="avatar-name">{me.name}</div>}
          {!editing && (
            <button className="link" onClick={() => setEditing(true)}>Edit details</button>
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
                <span className="mode-cell">
                  <strong>{me.activeRole === "cook" ? "🍳 Cook" : "🍽️ Consumer"}</strong>
                  <button className="icon-btn small-icon" aria-label="Switch mode"
                          disabled={switching} onClick={() => setSheetOpen(true)} title="Switch mode">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  </button>
                </span>
              </div>
            </div>
            {pushState !== "unsupported" && (
              <div className="notif-block">
                <div className="notif-head">
                  <span>🔔 New-dish alerts</span>
                  <button
                    className={pushOn ? "secondary small" : "small"}
                    disabled={pushBusy}
                    onClick={togglePush}
                  >
                    {pushBusy ? "…" : pushOn ? "Turn off" : "Turn on"}
                  </button>
                </div>
                <span className="muted">
                  Get notified when a cook lists food within 5 km of you.
                </span>
                {pushMsg && <span className="error-inline">{pushMsg}</span>}
              </div>
            )}
            {me.admin && (
              <button className="secondary" onClick={() => navigate("/admin/settlements")}>
                💸 Cook settlements
              </button>
            )}
            <button className="link" onClick={() => navigate("/")}>Back to home</button>
            <button className="link" onClick={logout}>Log out</button>
            <a className="link insta-link" href="https://www.instagram.com/swaadesi_" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              Follow us on Instagram
            </a>
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

      {sheetOpen && (
        <div className="sheet-overlay" onClick={() => setSheetOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Switch mode</h3>
            <button
              className={`sheet-option ${me.activeRole === "consumer" ? "selected" : ""}`}
              onClick={() => switchTo("consumer")}
            >
              <span>🍽️ Order food</span>
              {me.activeRole === "consumer" && <span className="tick">✓</span>}
            </button>
            <button
              className={`sheet-option ${me.activeRole === "cook" ? "selected" : ""}`}
              onClick={() => switchTo("cook")}
            >
              <span>🍳 Cook &amp; sell</span>
              {me.activeRole === "cook" && <span className="tick">✓</span>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
