import { useEffect, useState } from "react";
import { api, type FeedItem, type Order, type OrderStatus } from "../lib/api";

/** Consumer mode: vicinity feed of open dishes, order with a quantity, and your orders. */
export default function FeedPanel() {
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
      await api.placeOrder(it.id, n);
      setQty((q) => ({ ...q, [it.id]: 1 })); // reset count back to 1
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place the order.");
    } finally {
      setPlacing(null);
    }
  };

  const statusLabel: Record<OrderStatus, string> = {
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
  const past = orders.filter((o) => !activeStatuses.includes(o.status));

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

      {active.length > 0 && (
        <div className="orders-block">
          <label>Your orders</label>
          {active.map((o) => (
            <div key={o.id} className="order-item">
              <div className="profile-row">
                <span>{o.qty} × {o.listingTitle}{o.cookName ? ` · ${o.cookName}` : ""}</span>
                <strong>{statusLabel[o.status]}</strong>
              </div>
              {o.status === "ready" && o.pickupCode && (
                <div className="pickup-code">
                  Show this code to the cook: <strong>{o.pickupCode}</strong>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="orders-block history">
          <label>Order history</label>
          {past.map((o) => (
            <div className="profile-row" key={o.id}>
              <span>{o.qty} × {o.listingTitle}{o.cookName ? ` · ${o.cookName}` : ""}</span>
              <strong>{statusLabel[o.status]}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
