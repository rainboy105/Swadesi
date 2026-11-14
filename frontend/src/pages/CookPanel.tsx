import { useEffect, useState } from "react";
import { api, type Listing, type Order } from "../lib/api";

/** Cook mode: create a dish (with serving cap + order cutoff), manage listings, handle orders. */
export default function CookPanel() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [servings, setServings] = useState("");
  const [orderBy, setOrderBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [mine, recv] = await Promise.all([api.myListings(), api.receivedOrders()]);
      setListings(mine);
      setOrders(recv);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    const p = parseInt(price, 10);
    const s = parseInt(servings, 10);
    if (!title.trim()) return setError("What are you cooking?");
    if (!Number.isFinite(p) || p < 0) return setError("Enter a price per serving (₹).");
    if (!Number.isFinite(s) || s < 1) return setError("How many servings can you make?");
    setBusy(true);
    setError(null);
    try {
      await api.createListing({
        title: title.trim(),
        description: description.trim(),
        pricePerServing: p,
        maxServings: s,
        readyBy: null,
        orderBy: orderBy ? new Date(orderBy).toISOString() : null,
      });
      setTitle(""); setDescription(""); setPrice(""); setServings(""); setOrderBy("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (l: Listing) => {
    try {
      await api.setListingStatus(l.id, l.status === "open" ? "closed" : "open");
      await load();
    } catch {
      /* ignore */
    }
  };

  const decide = async (o: Order, status: "accepted" | "rejected") => {
    try {
      await api.setOrderStatus(o.id, status);
      await load();
    } catch {
      /* ignore */
    }
  };

  const pending = orders.filter((o) => o.status === "requested");
  const timeOf = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile marigold">🍳</span>
        <h1>Your kitchen</h1>
      </div>

      {!showForm && <button onClick={() => setShowForm(true)}>+ List a dish</button>}

      {showForm && (
        <div className="form-block">
          <label>Dish</label>
          <input placeholder="e.g. Veg Thali" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <label>Description (optional)</label>
          <input placeholder="Dal, rice, 2 sabzi, roti" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="row2">
            <div>
              <label>Price / serving (₹)</label>
              <input inputMode="numeric" placeholder="120" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label>Servings (cap)</label>
              <input inputMode="numeric" placeholder="10" value={servings} onChange={(e) => setServings(e.target.value)} />
            </div>
          </div>
          <label>Order by (optional cutoff)</label>
          <input type="datetime-local" value={orderBy} onChange={(e) => setOrderBy(e.target.value)} />
          <button disabled={busy} onClick={create}>{busy ? "Posting…" : "Post listing"}</button>
          <button className="link" onClick={() => { setShowForm(false); setError(null); }}>Cancel</button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {/* Pending orders to accept/reject */}
      {pending.length > 0 && (
        <div className="orders-block">
          <label>New orders</label>
          {pending.map((o) => (
            <div className="listing" key={o.id}>
              <div className="listing-main">
                <strong>{o.qty} × {o.listingTitle}</strong>
                {o.consumerName && <span className="muted">from {o.consumerName}</span>}
              </div>
              <div className="order-actions">
                <button className="small" onClick={() => decide(o, "accepted")}>Accept</button>
                <button className="secondary small" onClick={() => decide(o, "rejected")}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My listings */}
      {loading ? (
        <p className="hint">Loading your listings…</p>
      ) : listings.length === 0 ? (
        <p className="hint">No listings yet. Post what you're cooking today.</p>
      ) : (
        <div className="list">
          {listings.map((l) => {
            const cutoff = timeOf(l.orderBy);
            return (
              <div className={`listing ${l.status === "closed" ? "dim" : ""}`} key={l.id}>
                <div className="listing-main">
                  <strong>{l.title}</strong>
                  {l.description && <span className="muted">{l.description}</span>}
                  <span className="meta">
                    ₹{l.pricePerServing}/serving · {l.remaining}/{l.maxServings} left
                    {cutoff ? ` · order by ${cutoff}` : ""}
                    {l.status === "closed" ? " · closed" : ""}
                  </span>
                </div>
                <button className="secondary small" onClick={() => toggle(l)}>
                  {l.status === "open" ? "Close" : "Reopen"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
