import { useState } from "react";
import { api, type Me, type Role } from "../lib/api";
import AppHeader from "../components/AppHeader";
import CookPanel from "./CookPanel";
import FeedPanel from "./FeedPanel";

/**
 * Home. Every account can be both a cook and a consumer; the segmented toggle switches the
 * active mode (persisted). Profile lives on its own /profile page (top-right icon).
 */
export default function Home({ me, onMe }: { me: Me; onMe: (me: Me) => void }) {
  const [switching, setSwitching] = useState(false);
  const role = me.activeRole;

  const switchTo = async (next: Role) => {
    if (next === role || switching) return;
    setSwitching(true);
    try {
      onMe(await api.setRole(next));
    } catch {
      /* keep current role on failure */
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <AppHeader
        title={`Namaste${me.name ? `, ${me.name.split(" ")[0]}` : ""} 👋`}
        subtitle={role === "cook" ? "You're in cook mode" : "You're in consumer mode"}
      />
      <div className="card">
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

        {role === "consumer" ? <FeedPanel /> : <CookPanel me={me} onMe={onMe} />}
      </div>
    </>
  );
}
