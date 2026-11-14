import { useState } from "react";
import { api, setToken, type Me, type Role } from "../lib/api";
import CookPanel from "./CookPanel";
import FeedPanel from "./FeedPanel";

/**
 * Home + profile. Every account can be both a cook and a consumer; the segmented
 * toggle switches the active mode (persisted), which decides what the app shows.
 */
export default function Home({ me, onMe, onLogout }: {
  me: Me;
  onMe: (me: Me) => void;
  onLogout: () => void;
}) {
  const [switching, setSwitching] = useState(false);
  const role = me.activeRole;

  const switchTo = async (next: Role) => {
    if (next === role || switching) return;
    setSwitching(true);
    try {
      const updated = await api.setRole(next);
      onMe(updated);
    } catch {
      /* keep current role on failure */
    } finally {
      setSwitching(false);
    }
  };

  const logout = () => {
    setToken(null);
    onLogout();
  };

  return (
    <>
      <div className="hero">
        <div className="logo-box">🍲 Swaadeshi</div>
        <h2>Namaste{me.name ? `, ${me.name.split(" ")[0]}` : ""} 👋</h2>
        <p>{role === "cook" ? "You're in cook mode" : "You're in consumer mode"}</p>
      </div>

      <div className="card">
        {/* Mode switch */}
        <div className="segmented" role="tablist" aria-label="Switch mode">
          <button
            className={role === "consumer" ? "seg active" : "seg"}
            disabled={switching}
            onClick={() => switchTo("consumer")}
          >
            🍽️ Order food
          </button>
          <button
            className={role === "cook" ? "seg active" : "seg"}
            disabled={switching}
            onClick={() => switchTo("cook")}
          >
            🍳 Cook & sell
          </button>
        </div>

        {/* Mode-specific content */}
        {role === "consumer" ? <FeedPanel /> : <CookPanel />}

        {/* Profile */}
        <div className="profile">
          <label>Profile</label>
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
        </div>

        <button className="link" onClick={logout}>
          Log out
        </button>
      </div>
    </>
  );
}
