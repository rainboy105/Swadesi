import { useEffect, useRef, useState } from "react";
import { api, type Listing, type Order } from "../lib/api";
import { downscaleToJpeg } from "../lib/image";

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
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fmtLocal = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const toLocalInput = (iso: string | null) => (iso ? fmtLocal(new Date(iso)) : "");
  // Earliest selectable time = 5 minutes from now (no past cutoffs).
  const minDateTime = () => fmtLocal(new Date(Date.now() + 5 * 60 * 1000));
  // Sensible default when opening a fresh listing: 3 hours from now.
  const defaultOrderBy = () => fmtLocal(new Date(Date.now() + 3 * 60 * 60 * 1000));

  const prettyWhen = (local: string) => {
    if (!local) return "";
    const d = new Date(local);
    return d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setPrice(""); setServings(""); setOrderBy("");
    setPhoto(null); setPhotoPreview(null); setEditingId(null); setError(null);
  };

  const openCreate = () => {
    resetForm();
    setOrderBy(defaultOrderBy());
    setShowForm(true);
  };

  const startEdit = (l: Listing) => {
    setEditingId(l.id);
    setTitle(l.title);
    setDescription(l.description ?? "");
    setPrice(String(l.pricePerServing));
    setServings(String(l.maxServings));
    setOrderBy(toLocalInput(l.orderBy));
    setPhoto(null); setPhotoPreview(null);
    setShowForm(true);
    setError(null);
  };

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

  const submit = async () => {
    const p = parseInt(price, 10);
    const s = parseInt(servings, 10);
    if (!title.trim()) return setError("What are you cooking?");
    if (!Number.isFinite(p) || p < 0) return setError("Enter a price per serving (₹).");
    if (!Number.isFinite(s) || s < 1) return setError("How many servings can you make?");
    if (!orderBy) return setError("Set an order-by time (the cutoff for orders).");
    if (new Date(orderBy).getTime() <= Date.now()) return setError("Order-by time must be in the future.");
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(),
      description: description.trim(),
      pricePerServing: p,
      maxServings: s,
      readyBy: null,
      orderBy: new Date(orderBy).toISOString(),
    };
    try {
      if (editingId) {
        await api.updateListing(editingId, body);
        if (photo) {
          try {
            await api.uploadListingPhoto(editingId, await downscaleToJpeg(photo));
          } catch { /* keep listing even if photo fails */ }
        }
      } else {
        const created = await api.createListing(body);
        if (photo) {
          try {
            await api.uploadListingPhoto(created.id, await downscaleToJpeg(photo));
          } catch { /* keep listing even if photo fails */ }
        }
      }
      resetForm();
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = (f: File | null) => {
    setPhoto(f);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  };

  const toggle = async (l: Listing) => {
    try {
      await api.setListingStatus(l.id, l.status === "open" ? "closed" : "open");
      await load();
    } catch {
      /* ignore */
    }
  };

  const [codeInput, setCodeInput] = useState<Record<string, string>>({});
  const [codeErr, setCodeErr] = useState<Record<string, string>>({});

  const decide = async (o: Order, status: Order["status"], pickupCode?: string) => {
    try {
      await api.setOrderStatus(o.id, status, pickupCode);
      await load();
    } catch (e) {
      if (status === "completed") {
        setCodeErr({ ...codeErr, [o.id]: e instanceof Error ? e.message : "Wrong code" });
      }
    }
  };

  const pending = orders.filter((o) => o.status === "requested");
  const activeOrders = orders.filter(
    (o) => o.status === "accepted" || o.status === "preparing" || o.status === "ready",
  );
  const history = orders.filter((o) => o.status === "completed" || o.status === "rejected" || o.status === "cancelled");
  const histLabel: Record<string, string> = {
    completed: "🍴 Completed",
    rejected: "❌ Declined",
    cancelled: "Cancelled",
  };
  const timeOf = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile marigold">🍳</span>
        <h1>Your kitchen</h1>
      </div>

      {!showForm && <button onClick={openCreate}>+ List a dish</button>}

      {showForm && (
        <div className="form-block">
          {editingId && <strong className="form-title">Edit dish</strong>}
          <label>Dish <span className="req">*</span></label>
          <input placeholder="e.g. Veg Thali" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <label>Description (optional)</label>
          <input placeholder="Dal, rice, 2 sabzi, roti" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="row2">
            <div>
              <label>Price / serving (₹) <span className="req">*</span></label>
              <input inputMode="numeric" placeholder="120" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label>Servings (cap) <span className="req">*</span></label>
              <input inputMode="numeric" placeholder="10" value={servings} onChange={(e) => setServings(e.target.value)} />
            </div>
          </div>
          <label>Order by <span className="req">*</span> <span style={{fontWeight:400}}>(orders close at this time)</span></label>
          <input
            type="datetime-local"
            value={orderBy}
            min={minDateTime()}
            onChange={(e) => setOrderBy(e.target.value)}
          />
          {orderBy && <span className="when-note">⏰ Orders close {prettyWhen(orderBy)}</span>}
          <label>Photo {editingId ? "(replace, optional)" : "(optional)"}</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
          />
          {photoPreview && <img className="photo-preview" src={photoPreview} alt="Dish preview" />}
          <button disabled={busy} onClick={submit}>
            {busy ? "Saving…" : editingId ? "Save changes" : "Post listing"}
          </button>
          <button className="link" onClick={() => { resetForm(); setShowForm(false); }}>Cancel</button>
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

      {/* Orders in progress: accepted -> preparing -> ready -> completed (with pickup code) */}
      {activeOrders.length > 0 && (
        <div className="orders-block">
          <label>In progress</label>
          {activeOrders.map((o) => (
            <div className="listing col" key={o.id}>
              <div className="listing-main">
                <strong>{o.qty} × {o.listingTitle}</strong>
                {o.consumerName && <span className="muted">for {o.consumerName}</span>}
                <span className="meta">
                  {o.status === "accepted" && "Accepted"}
                  {o.status === "preparing" && "👨‍🍳 Preparing"}
                  {o.status === "ready" && "🛍️ Ready for pickup"}
                </span>
              </div>
              {o.status === "accepted" && (
                <button className="small" onClick={() => decide(o, "preparing")}>Start preparing</button>
              )}
              {o.status === "preparing" && (
                <button className="small" onClick={() => decide(o, "ready")}>Mark ready</button>
              )}
              {o.status === "ready" && (
                <div className="pickup-confirm">
                  <span className="muted">Ask for the pickup code:</span>
                  <div className="order-row">
                    <input
                      inputMode="numeric"
                      placeholder="4-digit code"
                      value={codeInput[o.id] ?? ""}
                      onChange={(e) => setCodeInput({ ...codeInput, [o.id]: e.target.value })}
                    />
                    <button className="small" onClick={() => decide(o, "completed", codeInput[o.id])}>
                      Confirm pickup
                    </button>
                  </div>
                  {codeErr[o.id] && <span className="error-inline">{codeErr[o.id]}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Order history */}
      {history.length > 0 && (
        <div className="orders-block history">
          <label>Order history</label>
          {history.map((o) => (
            <div className="profile-row" key={o.id}>
              <span>{o.qty} × {o.listingTitle}{o.consumerName ? ` · ${o.consumerName}` : ""}</span>
              <strong>{histLabel[o.status]}</strong>
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
              <div className={`listing ${l.status === "closed" || l.expired ? "dim" : ""}`} key={l.id}>
                {l.hasPhoto && (
                  <img className="listing-thumb" src={api.listingPhotoUrl(l.id)} alt={l.title} />
                )}
                <div className="listing-main">
                  <strong>{l.title}</strong>
                  {l.description && <span className="muted">{l.description}</span>}
                  <span className="meta">
                    ₹{l.pricePerServing}/serving · {l.remaining}/{l.maxServings} left
                    {cutoff ? ` · order by ${cutoff}` : ""}
                    {l.expired ? " · order time passed" : l.status === "closed" ? " · closed" : ""}
                  </span>
                </div>
                <div className="order-actions">
                  <button className="icon-btn small-icon" aria-label="Edit dish" onClick={() => startEdit(l)}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  {!l.expired && (
                    <button className="secondary small" onClick={() => toggle(l)}>
                      {l.status === "open" ? "Close" : "Reopen"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
