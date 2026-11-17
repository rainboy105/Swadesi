import { useEffect, useState } from "react";
import { api, type Me, type Role } from "../lib/api";
import AppHeader from "../components/AppHeader";
import CookPanel from "./CookPanel";
import FeedPanel from "./FeedPanel";
import CooksPanel from "./CooksPanel";
import CookRequests from "./CookRequests";
import MyRequests from "./MyRequests";
import MenuManager from "../components/MenuManager";

/**
 * Home. Buy/sell mode is chosen from a bottom sheet (the swap icon top-right). The top toggle
 * switches sections within the current mode (My Feed / My Orders, or Kitchen / Orders).
 */
export default function Home({ me, onMe }: { me: Me; onMe: (me: Me) => void }) {
  const [switching, setSwitching] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [consumerTab, setConsumerTab] = useState<"feed" | "orders" | "cooks">("feed");
  const [cookTab, setCookTab] = useState<"kitchen" | "orders" | "menu">("kitchen");
  const role = me.activeRole;
  const [pendingReq, setPendingReq] = useState(0);   // cook: new (pending) requests
  const [payableReq, setPayableReq] = useState(0);   // consumer: accepted requests awaiting payment
  // Within the Orders tab, switch between the Orders list and the Requests list.
  const [ordersSub, setOrdersSub] = useState<"orders" | "requests">("orders");

  // Badge the cook's Requests with the count of new (pending) requests.
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
  }, [role, cookTab, ordersSub]);

  // Badge the consumer's Requests with the count accepted and awaiting payment.
  useEffect(() => {
    if (role !== "consumer") {
      setPayableReq(0);
      return;
    }
    let active = true;
    const fetchCount = () =>
      api
        .myRequests()
        .then((rs) => {
          if (active) setPayableReq(rs.filter((r) => r.status === "accepted").length);
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
  }, [role, consumerTab, ordersSub]);

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
          { key: "menu", label: "Menu" },
        ];
  const activeTab = role === "consumer" ? consumerTab : cookTab;
  const setTab = (k: string) =>
    role === "consumer"
      ? setConsumerTab(k as "feed" | "orders" | "cooks")
      : setCookTab(k as "kitchen" | "orders" | "menu");

  // Sub-toggle inside the Orders tab: Orders | Requests (with a count badge).
  const ordersSubBar = (badge: number) => (
    <div className="segmented sub" role="tablist" aria-label="Orders or requests">
      <button className={ordersSub === "orders" ? "seg active" : "seg"} onClick={() => setOrdersSub("orders")}>
        Orders
      </button>
      <button className={ordersSub === "requests" ? "seg active" : "seg"} onClick={() => setOrdersSub("requests")}>
        Requests
        {badge > 0 && <span className="tab-badge">{badge}</span>}
      </button>
    </div>
  );

  return (
    <>
      <AppHeader
        title={`Namaste${me.name ? `, ${me.name.split(" ")[0]}` : ""} 👋`}
        subtitle={role === "cook" ? "You're in cook mode" : "You're in consumer mode"}
        onSwap={() => setSheetOpen(true)}
        avatarSrc={me.hasAvatar
          ? api.avatarUrl(me.id)
          : role === "cook" ? "/avatars/cook.svg?v=3" : "/avatars/consumer.svg?v=3"}
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
              {s.key === "orders" && (role === "cook" ? pendingReq : payableReq) > 0 && (
                <span className="tab-badge">{role === "cook" ? pendingReq : payableReq}</span>
              )}
            </button>
          ))}
        </div>

        {role === "consumer" ? (
          consumerTab === "cooks" ? (
            <CooksPanel />
          ) : consumerTab === "orders" ? (
            <>
              {ordersSubBar(payableReq)}
              {ordersSub === "orders"
                ? <FeedPanel view="orders" me={me} onMe={onMe} />
                : <MyRequests />}
            </>
          ) : (
            <FeedPanel view={consumerTab} me={me} onMe={onMe} />
          )
        ) : cookTab === "menu" ? (
          <MenuManager />
        ) : cookTab === "orders" ? (
          <>
            {ordersSubBar(pendingReq)}
            {ordersSub === "orders"
              ? <CookPanel me={me} onMe={onMe} view="orders" />
              : <CookRequests />}
          </>
        ) : (
          <CookPanel me={me} onMe={onMe} view="kitchen" />
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
