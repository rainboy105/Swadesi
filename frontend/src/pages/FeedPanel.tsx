import { useEffect, useState } from "react";
import { api, type FeedItem, type Order, type OrderStatus } from "../lib/api";
import PickupMap from "../components/PickupMap";

/** Consumer mode. view="feed": dishes to order. view="orders": your orders + pickup map. */
export default function FeedPanel({ view }: { view: "feed" | "orders" }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [placing, setPlacing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [feed, mine] = await Promise.all([api.nearbyListings(), api.myOrders()]);
      setItems(feed);
      setOrders(mine);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const distance = (m: number) => (m < 1000 ? `${m} m away` : `${(m / 1000).toFixed(1)} km away`);
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
        // Show UPI first; the rest of the methods appear below it.
        config: {
          display: {
            blocks: {
              upi: { name: "Pay by UPI", instruments: [{ method: "upi" }] },
            },
            sequence: ["block.upi"],
            preferences: { show_default_blocks: true },
          },
        },
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
    return (
      <div className="mode-panel">
        <div className="panel-head">
          <span className="tile">📦</span>
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
              <div className="order-cards">
                <label>Active</label>
                {active.map((o) => (
                  <div key={o.id} className="order-card">
                    <div className="order-card-head">
                      <strong>{o.listingTitle}</strong>
                      <span className={`status-pill s-${o.status}`}>{statusLabel[o.status]}</span>
                    </div>
                    <div className="order-card-meta">
                      <span>Qty: {o.qty}</span>
                      {o.cookName && <span>Cook: {o.cookName}</span>}
                      <span>Ordered {new Date(o.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    {o.status === "ready" && o.pickupCode && (
                      <div className="pickup-code">
                        Show this code to the cook: <strong>{o.pickupCode}</strong>
                      </div>
                    )}
                    {(o.status === "accepted" || o.status === "preparing" || o.status === "ready") &&
                      o.cookLat != null && o.cookLng != null && (
                        <>
                          <span className="map-caption">📍 Pickup location — {o.listingTitle}</span>
                          <PickupMap cookLat={o.cookLat} cookLng={o.cookLng} title={o.listingTitle} />
                        </>
                      )}
                  </div>
                ))}
              </div>
            )}
            {past.length > 0 && (
              <div className="orders-block history">
                <label>Past orders</label>
                {past.map((o) => (
                  <div className="profile-row" key={o.id}>
                    <span>{o.qty} × {o.listingTitle}{o.cookName ? ` · ${o.cookName}` : ""}</span>
                    <strong>{statusLabel[o.status]}</strong>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ---- Feed view ----
  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile">🍽️</span>
        <h1>Food near you</h1>
        <button className="link refresh" onClick={load} aria-label="Refresh">↻</button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="hint">Looking for dishes nearby…</p>
      ) : items.length === 0 ? (
        <p className="hint">No dishes nearby right now. Check back around meal times!</p>
      ) : (
        <div className="list">
          {items.map((it) => {
            const n = qty[it.id] ?? 1;
            const cutoff = timeOf(it.orderBy);
            return (
              <div className="listing" key={it.id}>
                {it.hasPhoto && (
                  <img className="listing-thumb" src={api.listingPhotoUrl(it.id)} alt={it.title} />
                )}
                <div className="listing-main">
                  <strong>{it.title}</strong>
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
        </div>
      )}
    </div>
  );
}
