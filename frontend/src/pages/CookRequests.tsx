import { useEffect, useState } from "react";
import { api, type DishRequest, type RequestStatus } from "../lib/api";

const statusLabel: Record<RequestStatus, string> = {
  pending: "⏳ New request",
  accepted: "✅ Accepted — awaiting payment",
  rejected: "❌ Declined",
  cancelled: "Cancelled by customer",
  fulfilled: "🍴 Paid — now an order",
};

/** Cook: incoming dish requests. Accept with a price/serving, or reject. */
export default function CookRequests() {
  const [requests, setRequests] = useState<DishRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.incomingRequests().then(setRequests).catch(() => setRequests([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const accept = async (r: DishRequest) => {
    const p = parseInt(price[r.id] ?? "", 10);
    if (!Number.isFinite(p) || p < 0) return setErr("Enter a price per serving.");
    setBusy(r.id);
    setErr(null);
    try {
      await api.acceptRequest(r.id, p);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not accept.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (r: DishRequest) => {
    setBusy(r.id);
    setErr(null);
    try {
      await api.rejectRequest(r.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not decline.");
    } finally {
      setBusy(null);
    }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const handled = requests.filter((r) => r.status !== "pending");

  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile marigold">📨</span>
        <h1>Requests</h1>
        <button className="link refresh" onClick={load} aria-label="Refresh">↻</button>
      </div>

      {err && <p className="error">{err}</p>}

      {loading ? (
        <p className="hint">Loading requests…</p>
      ) : requests.length === 0 ? (
        <p className="hint">No requests yet. Customers nearby can ask you to cook a dish.</p>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="list">
              <label>New</label>
              {pending.map((r) => (
                <div className="form-block" key={r.id}>
                  <strong>{r.qty} × {r.dishName}</strong>
                  <span className="muted">
                    From {r.consumerName ?? "a customer"}{r.note ? ` · “${r.note}”` : ""}
                  </span>
                  <label>Your price / serving (₹)</label>
                  <input inputMode="numeric" placeholder="e.g. 120"
                         value={price[r.id] ?? ""}
                         onChange={(e) => setPrice({ ...price, [r.id]: e.target.value })} />
                  <div className="order-row">
                    <button className="small" disabled={busy === r.id} onClick={() => accept(r)}>
                      {busy === r.id ? "…" : "Accept"}
                    </button>
                    <button className="secondary small" disabled={busy === r.id} onClick={() => reject(r)}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {handled.length > 0 && (
            <div className="list">
              <label>Earlier</label>
              {handled.map((r) => (
                <div className="listing" key={r.id} style={{ display: "block" }}>
                  <div className="listing-main">
                    <strong>{r.qty} × {r.dishName}</strong>
                    <span className="muted">{r.consumerName ?? "a customer"}</span>
                    <span className="meta">{statusLabel[r.status]}
                      {r.pricePerServing != null ? ` · ₹${r.pricePerServing}/serving` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
