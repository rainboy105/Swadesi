import { useEffect, useState } from "react";
import { api, type FeedItem } from "../lib/api";

/** Consumer mode: the vicinity feed of open dishes within walking distance. */
export default function FeedPanel() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api.nearbyListings());
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

  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile">🍽️</span>
        <h1>Food near you</h1>
        <button className="link refresh" onClick={load}>↻</button>
      </div>

      {loading ? (
        <p className="hint">Looking for dishes nearby…</p>
      ) : items.length === 0 ? (
        <p className="hint">No dishes nearby right now. Check back around meal times!</p>
      ) : (
        <div className="list">
          {items.map((it) => (
            <div className="listing" key={it.id}>
              <div className="listing-main">
                <strong>{it.title}</strong>
                {it.description && <span className="muted">{it.description}</span>}
                <span className="meta">
                  {it.cookName ? `${it.cookName} · ` : ""}₹{it.pricePerServing}/serving · {it.remaining} left
                </span>
                <span className="dist">📍 {distance(it.distanceMeters)}</span>
              </div>
              <button className="small" disabled title="Ordering coming next">Order</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
