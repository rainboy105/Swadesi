import { useState } from "react";
import { type Me } from "../lib/api";
import AppHeader from "../components/AppHeader";
import CookPanel from "./CookPanel";
import FeedPanel from "./FeedPanel";

/**
 * Home. The active mode (buy = consumer, sell = cook) is chosen in the profile, not here.
 * Each mode shows its own bottom-tab sections.
 */
export default function Home({ me, onMe }: { me: Me; onMe: (me: Me) => void }) {
  const [consumerTab, setConsumerTab] = useState<"feed" | "orders">("feed");
  const [cookTab, setCookTab] = useState<"kitchen" | "orders">("kitchen");
  const role = me.activeRole;

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
        subtitle={role === "cook" ? "Selling — your kitchen" : "Ordering food near you"}
      />
      <div className="card with-tabs">
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
