import { useEffect, useState } from "react";
import { api, radiusLabel, type FeedItem, type FoodType, type Me, type Order, type OrderStatus } from "../lib/api";
import PickupMap from "../components/PickupMap";
import RadiusSlider from "../components/RadiusSlider";

/** Consumer mode. view="feed": dishes to order. view="orders": your orders + pickup map. */
export default function FeedPanel({ view, me, onMe }: {
  view: "feed" | "orders";
  me: Me;
  onMe: (me: Me) => void;
}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [placing, setPlacing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [foodFilter, setFoodFilter] = useState<"all" | FoodType>("all");

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [feed, mine] = await Promise.all([api.nearbyListings(), api.myOrders()]);
      setItems(feed);
      setOrders(mine);
    } catch {
      /* ignore */
    } finally {
      if (!silent) setLoading(false);
    }
  };
  const load = () => fetchData(false);

  // Initial load + silent auto-refresh (poll while visible, and on tab focus).
  useEffect(() => {
    fetchData(false);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchData(true);
    }, 12000);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchData(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const distance = (m: number) => (m < 1000 ? `${m} m away` : `${(m / 1000).toFixed(1)} km away`);

  const changeRadius = async (m: number) => {
    try {
      onMe(await api.setRadius(m));
      await fetchData(true);
    } catch {
      /* ignore */
    }
  };

  const RadiusPicker = () => (
    <RadiusSlider value={me.searchRadiusM} onChange={changeRadius} />
  );
  const timeOf = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

  const order = async (it: FeedItem) => {
    const n = qty[it.id] ?? 1;
    setPlacing(it.id);
    setError(null);
    try {
      const res = await api.placeOrder(it.id, n);
      if (!res.paymentRequired) {
        setQty((q) => ({ ...q, [it.id]: 1 }));
        await load();
        return;
      }
      // Payment required: open Razorpay checkout.
      const Razorpay = (window as unknown as { Razorpay?: new (o: unknown) => { open: () => void } }).Razorpay;
      if (!Razorpay) {
        setError("Payment couldn't load. Please retry.");
        await api.cancelUnpaidOrder(res.order.id);
        return;
      }
      const rzp = new Razorpay({
        key: res.razorpayKeyId,
        order_id: res.razorpayOrderId,
        amount: res.amountPaise,
        currency: res.currency ?? "INR",
        name: "Swaadesi",
        description: `${n} × ${res.dish ?? it.title}`,
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api.verifyPayment(res.order.id, {
              razorpayOrderId: r.razorpay_order_id,
              razorpayPaymentId: r.razorpay_payment_id,
              razorpaySignature: r.razorpay_signature,
            });
            setQty((q) => ({ ...q, [it.id]: 1 }));
          } catch {
            setError("Payment taken but verification failed — contact support.");
          } finally {
            await load();
          }
        },
        modal: {
          ondismiss: async () => {
            await api.cancelUnpaidOrder(res.order.id);
            await load();
          },
        },
        // Let Razorpay render its full native UPI flow (apps + "enter UPI ID" collect),
        // which is device-optimized and avoids the QR-gallery path some apps restrict.
        theme: { color: "#7c3aed" },
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place the order.");
    } finally {
      setPlacing(null);
    }
  };

  const statusLabel: Record<OrderStatus, string> = {
    pending_payment: "💳 Awaiting payment",
    requested: "⏳ Waiting for cook",
    accepted: "✅ Accepted",
    preparing: "👨‍🍳 Preparing",
    ready: "🛍️ Ready for pickup",
    rejected: "❌ Declined",
    cancelled: "Cancelled",
    completed: "🍴 Completed",
  };

  const activeStatuses: OrderStatus[] = ["requested", "accepted", "preparing", "ready"];
  const active = orders.filter((o) => activeStatuses.includes(o.status));
  // Hide transient unpaid orders; everything else resolved goes to history.
  const past = orders.filter(
    (o) => !activeStatuses.includes(o.status) && o.status !== "pending_payment",
  );

  // ---- Orders view ----
  if (view === "orders") {
    const selected = orders.find((o) => o.id === selectedId) ?? null;
    const when = (iso: string) =>
      new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

    // Detail view for a tapped order.
    if (selected) {
      const o = selected;
      const showMap =
        (o.status === "accepted" || o.status === "preparing" || o.status === "ready") &&
        o.cookLat != null && o.cookLng != null;
      return (
        <div className="mode-panel">
          <div className="panel-head">
            <button className="icon-btn small-icon" aria-label="Back" onClick={() => setSelectedId(null)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <h1>Order details</h1>
          </div>

          <div className="order-card">
            <div className="order-card-head">
              <strong>{o.listingTitle}</strong>
              <span className={`status-pill s-${o.status}`}>{statusLabel[o.status]}</span>
            </div>
            <div className="detail-rows">
              <div className="profile-row"><span>Quantity</span><strong>{o.qty}</strong></div>
              {o.cookName && <div className="profile-row"><span>Cook</span><strong>{o.cookName}</strong></div>}
              <div className="profile-row"><span>Ordered</span><strong>{when(o.createdAt)}</strong></div>
            </div>
            {o.status === "ready" && o.pickupCode && (
              <div className="pickup-code">Show this code to the cook: <strong>{o.pickupCode}</strong></div>
            )}
            {showMap && (
              <>
                <span className="map-caption">📍 Pickup location</span>
                <PickupMap cookLat={o.cookLat!} cookLng={o.cookLng!} title={o.listingTitle} />
              </>
            )}
            {!showMap && (
              <p className="hint">
                {o.status === "requested" ? "Waiting for the cook to accept. The pickup map appears once accepted."
                  : o.status === "completed" ? "Order picked up. Enjoy your meal! 🍴"
                  : o.status === "rejected" ? "This order was declined; any payment is refunded."
                  : ""}
              </p>
            )}
          </div>
        </div>
      );
    }

    // List view: active (highlighted) at top, then past.
    return (
      <div className="mode-panel">
        <div className="panel-head">
          <span className="tile marigold">📦</span>
          <h1>My orders</h1>
          <button className="link refresh" onClick={load} aria-label="Refresh">↻</button>
        </div>

        {loading ? (
          <p className="hint">Loading your orders…</p>
        ) : active.length === 0 && past.length === 0 ? (
          <p className="hint">No orders yet. Find something tasty in the Feed!</p>
        ) : (
          <>
            {active.length > 0 && (
              <div className="order-list">
                <label>Active</label>
                {active.map((o) => (
                  <button key={o.id} className="order-row-btn active" onClick={() => setSelectedId(o.id)}>
                    <div className="orb-main">
                      <strong>{o.qty} × {o.listingTitle}</strong>
                      <span className="muted">{o.cookName ?? ""} · {when(o.createdAt)}</span>
                    </div>
                    <span className={`status-pill s-${o.status}`}>{statusLabel[o.status]}</span>
                    <span className="chev">›</span>
                  </button>
                ))}
              </div>
            )}
            {past.length > 0 && (
              <div className="order-list">
                <label>Past orders</label>
                {past.map((o) => (
                  <button key={o.id} className="order-row-btn" onClick={() => setSelectedId(o.id)}>
                    <div className="orb-main">
                      <strong>{o.qty} × {o.listingTitle}</strong>
                      <span className="muted">{o.cookName ?? ""} · {when(o.createdAt)}</span>
                    </div>
                    <span className={`status-pill s-${o.status}`}>{statusLabel[o.status]}</span>
                    <span className="chev">›</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ---- Feed view ----
  const visible = foodFilter === "all" ? items : items.filter((it) => it.foodType === foodFilter);
  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile">🍽️</span>
        <h1>Food near you</h1>
        <button className="link refresh" onClick={load} aria-label="Refresh">↻</button>
      </div>

      <div className="feed-locnote">
        📍 Showing food near <strong>{me.addressText ?? "your saved society"}</strong>.
        Somewhere else? Update your location in profile.
      </div>

      {!loading && items.length > 0 && (
        <div className="foodtype-filter">
          {([
            { key: "all", label: "All" },
            { key: "veg", label: "Veg" },
            { key: "nonveg", label: "Non-veg" },
          ] as { key: "all" | FoodType; label: string }[]).map((f) => (
            <button
              key={f.key}
              className={`ft-chip ${f.key} ${foodFilter === f.key ? "on" : ""}`}
              aria-pressed={foodFilter === f.key}
              onClick={() => setFoodFilter(f.key)}
            >
              {f.key !== "all" && <span className={`veg-mark ${f.key}`} aria-hidden="true" />}
              {f.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="hint">Looking for dishes nearby…</p>
      ) : visible.length === 0 ? (
        foodFilter !== "all" && items.length > 0 ? (
          <p className="hint">
            No {foodFilter === "veg" ? "veg" : "non-veg"} dishes nearby right now. Try “All”.
          </p>
        ) : (
          <>
            <p className="hint">
              No dishes within {radiusLabel(me.searchRadiusM)}. Try a wider search area:
            </p>
            <RadiusPicker />
          </>
        )
      ) : (
        <div className="list">
          {visible.map((it) => {
            const n = qty[it.id] ?? 1;
            const cutoff = timeOf(it.orderBy);
            return (
              <div className="listing" key={it.id}>
                {it.hasPhoto ? (
                  <img className="listing-thumb" src={api.listingPhotoUrl(it.id)} alt={it.title} />
                ) : (
                  <div className="listing-thumb placeholder" aria-hidden="true">🍲</div>
                )}
                <div className="listing-main">
                  <strong>
                    <span className={`veg-mark ${it.foodType}`} aria-label={it.foodType === "veg" ? "Veg" : "Non-veg"} />
                    {it.title}
                  </strong>
                  {it.description && <span className="muted">{it.description}</span>}
                  <span className="meta">
                    {it.cookName ? `${it.cookName} · ` : ""}₹{it.pricePerServing}/serving · {it.remaining} left
                  </span>
                  <span className="dist">
                    📍 {distance(it.distanceMeters)}
                    {cutoff ? ` · order by ${cutoff}` : ""}
                  </span>
                  <div className="order-row">
                    <div className="stepper">
                      <button disabled={n <= 1} onClick={() => setQty({ ...qty, [it.id]: Math.max(1, n - 1) })}>−</button>
                      <span>{n}</span>
                      <button disabled={n >= it.remaining} onClick={() => setQty({ ...qty, [it.id]: Math.min(it.remaining, n + 1) })}>+</button>
                    </div>
                    <button className="small" disabled={placing === it.id || it.remaining < 1} onClick={() => order(it)}>
                      {placing === it.id ? "…" : "Order"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="list-footer">
            <span className="muted">Not finding enough? Widen your search.</span>
            <RadiusPicker />
          </div>
        </div>
      )}
    </div>
  );
}
