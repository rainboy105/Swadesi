import { useState } from "react";
import { api, type Me, type Role } from "../lib/api";
import AppHeader from "../components/AppHeader";
import CookPanel from "./CookPanel";
import FeedPanel from "./FeedPanel";

/**
 * Home. Every account can be both a cook and a consumer; the segmented toggle switches the
 * active mode. Each mode has its own bottom-tab sections. Profile lives at /profile.
 */
export default function Home({ me, onMe }: { me: Me; onMe: (me: Me) => void }) {
  const [switching, setSwitching] = useState(false);
  const [consumerTab, setConsumerTab] = useState<"feed" | "orders">("feed");
  const [cookTab, setCookTab] = useState<"kitchen" | "orders">("kitchen");
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

  const tabs =
    role === "consumer"
      ? [
          { key: "feed", label: "Feed", icon: "🍽️" },
          { key: "orders", label: "My Orders", icon: "📦" },
        ]
      : [
          { key: "kitchen", label: "Kitchen", icon: "🍳" },
          { key: "orders", label: "Orders", icon: "📦" },
        ];
  const activeTab = role === "consumer" ? consumerTab : cookTab;
  const setTab = (k: string) =>
    role === "consumer" ? setConsumerTab(k as "feed" | "orders") : setCookTab(k as "kitchen" | "orders");

  return (
    <>
      <AppHeader
        title={`Namaste${me.name ? `, ${me.name.split(" ")[0]}` : ""} 👋`}
        subtitle={role === "cook" ? "You're in cook mode" : "You're in consumer mode"}
      />
      <div className="card with-tabs">
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

        {role === "consumer" ? (
          <FeedPanel view={consumerTab} />
        ) : (
          <CookPanel me={me} onMe={onMe} view={cookTab} />
        )}
      </div>

      {/* Bottom section navigation */}
      <nav className="bottom-nav">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={activeTab === t.key ? "nav-item active" : "nav-item"}
            onClick={() => setTab(t.key)}
          >
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
