import { useEffect, useState } from "react";
import { api, type Me, type Role } from "../lib/api";
import AppHeader from "../components/AppHeader";
import CookPanel from "./CookPanel";
import FeedPanel from "./FeedPanel";
import CooksPanel from "./CooksPanel";
import CookRequests from "./CookRequests";

/**
 * Home. Buy/sell mode is chosen from a bottom sheet (the swap icon top-right). The top toggle
 * switches sections within the current mode (My Feed / My Orders, or Kitchen / Orders).
 */
export default function Home({ me, onMe }: { me: Me; onMe: (me: Me) => void }) {
  const [switching, setSwitching] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [consumerTab, setConsumerTab] = useState<"feed" | "orders" | "cooks">("feed");
  const [cookTab, setCookTab] = useState<"kitchen" | "orders" | "requests">("kitchen");
  const role = me.activeRole;
  const [pendingReq, setPendingReq] = useState(0);

  // Badge the cook's Requests tab with the count of new (pending) requests.
  useEffect(() => {
    if (role !== "cook") {
      setPendingReq(0);
      return;
    }
    let active = true;
    const fetchCount = () =>
      api
        .incomingRequests()
        .then((rs) => {
          if (active) setPendingReq(rs.filter((r) => r.status === "pending").length);
        })
        .catch(() => {});
    fetchCount();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchCount();
    }, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [role, cookTab]);

  const switchTo = async (next: Role) => {
    setSheetOpen(false);
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

  const sections =
    role === "consumer"
      ? [
          { key: "feed", label: "My Feed" },
          { key: "orders", label: "My Orders" },
          { key: "cooks", label: "Cooks" },
        ]
      : [
          { key: "kitchen", label: "Kitchen" },
          { key: "orders", label: "Orders" },
          { key: "requests", label: "Requests" },
        ];
  const activeTab = role === "consumer" ? consumerTab : cookTab;
  const setTab = (k: string) =>
    role === "consumer"
      ? setConsumerTab(k as "feed" | "orders" | "cooks")
      : setCookTab(k as "kitchen" | "orders" | "requests");

  return (
    <>
      <AppHeader
        title={`Namaste${me.name ? `, ${me.name.split(" ")[0]}` : ""} 👋`}
        subtitle={role === "cook" ? "You're in cook mode" : "You're in consumer mode"}
        onSwap={() => setSheetOpen(true)}
      />
      <div className="card">
        {/* Top toggle = section switcher */}
        <div className="segmented" role="tablist" aria-label="Sections">
          {sections.map((s) => (
            <button
              key={s.key}
              className={activeTab === s.key ? "seg active" : "seg"}
              onClick={() => setTab(s.key)}
            >
              {s.label}
              {s.key === "requests" && pendingReq > 0 && (
                <span className="tab-badge">{pendingReq}</span>
              )}
            </button>
          ))}
        </div>

        {role === "consumer" ? (
          consumerTab === "cooks" ? (
            <CooksPanel onOrdered={() => setConsumerTab("orders")} />
          ) : (
            <FeedPanel view={consumerTab} me={me} onMe={onMe} />
          )
        ) : cookTab === "requests" ? (
          <CookRequests />
        ) : (
          <CookPanel me={me} onMe={onMe} view={cookTab} />
        )}
      </div>

      {/* Bottom sheet: choose buy/sell mode */}
      {sheetOpen && (
        <div className="sheet-overlay" onClick={() => setSheetOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Switch mode</h3>
            <button
              className={`sheet-option ${role === "consumer" ? "selected" : ""}`}
              onClick={() => switchTo("consumer")}
            >
              <span>🍽️ Order food</span>
              {role === "consumer" && <span className="tick">✓</span>}
            </button>
            <button
              className={`sheet-option ${role === "cook" ? "selected" : ""}`}
              onClick={() => switchTo("cook")}
            >
              <span>🍳 Cook &amp; sell</span>
              {role === "cook" && <span className="tick">✓</span>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
