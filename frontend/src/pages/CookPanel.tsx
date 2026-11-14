import { useEffect, useState } from "react";
import { api, type Listing } from "../lib/api";

/** Cook mode: create a dish listing with a serving cap, and manage your listings. */
export default function CookPanel() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [servings, setServings] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setListings(await api.myListings());
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
      });
      setTitle("");
      setDescription("");
      setPrice("");
      setServings("");
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

  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile marigold">🍳</span>
        <h1>Your kitchen</h1>
      </div>

      {!showForm && (
        <button onClick={() => setShowForm(true)}>+ List a dish</button>
      )}

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
              <label>Servings</label>
              <input inputMode="numeric" placeholder="10" value={servings} onChange={(e) => setServings(e.target.value)} />
            </div>
          </div>
          <button disabled={busy} onClick={create}>{busy ? "Posting…" : "Post listing"}</button>
          <button className="link" onClick={() => { setShowForm(false); setError(null); }}>Cancel</button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="hint">Loading your listings…</p>
      ) : listings.length === 0 ? (
        <p className="hint">No listings yet. Post what you're cooking today.</p>
      ) : (
        <div className="list">
          {listings.map((l) => (
            <div className={`listing ${l.status === "closed" ? "dim" : ""}`} key={l.id}>
              <div className="listing-main">
                <strong>{l.title}</strong>
                {l.description && <span className="muted">{l.description}</span>}
                <span className="meta">
                  ₹{l.pricePerServing}/serving · {l.remaining}/{l.maxServings} left
                  {l.status === "closed" ? " · closed" : ""}
                </span>
              </div>
              <button className="secondary small" onClick={() => toggle(l)}>
                {l.status === "open" ? "Close" : "Reopen"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
