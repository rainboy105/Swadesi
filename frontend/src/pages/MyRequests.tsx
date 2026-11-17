import { useEffect, useState } from "react";
import { api, type DishRequest, type RequestStatus } from "../lib/api";
import { placeOrderFlow } from "../lib/placeOrder";

const statusLabel: Record<RequestStatus, string> = {
  pending: "⏳ Waiting for cook",
  accepted: "✅ Accepted — pay to confirm",
  rejected: "❌ Declined",
  cancelled: "Cancelled",
  fulfilled: "🍴 Ordered",
};

/**
 * Consumer: the dishes they've requested from cooks. Active ones (waiting / accepted) on top,
 * finished ones (declined / cancelled / ordered) kept below as history.
 */
export default function MyRequests({ onOrdered }: { onOrdered?: () => void }) {
  const [requests, setRequests] = useState<DishRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.myRequests().then(setRequests).catch(() => setRequests([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const pay = async (r: DishRequest) => {
    if (!r.listingId || r.pricePerServing == null) return;
    setPayingId(r.id);
    setErr(null);
    try {
      await placeOrderFlow(r.listingId, r.qty, r.dishName);
      await load();
      onOrdered?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment could not be completed.");
    } finally {
      setPayingId(null);
    }
  };

  const active = requests.filter((r) => r.status === "pending" || r.status === "accepted");
  const past = requests.filter((r) => r.status !== "pending" && r.status !== "accepted");

  const row = (r: DishRequest) => (
    <div className="listing" key={r.id} style={{ display: "block" }}>
      <div className="listing-main">
        <strong>{r.qty} × {r.dishName}</strong>
        <span className="muted">{r.cookName ?? ""}{r.note ? ` · “${r.note}”` : ""}</span>
        <span className="meta">{statusLabel[r.status]}
          {r.status === "accepted" && r.pricePerServing != null ? ` · ₹${r.pricePerServing * r.qty} total` : ""}</span>
        {r.status === "accepted" && r.listingId && (
          <button className="small" style={{ marginTop: 10, alignSelf: "flex-start" }}
                  disabled={payingId === r.id} onClick={() => pay(r)}>
            {payingId === r.id ? "…" : `Pay ₹${(r.pricePerServing ?? 0) * r.qty}`}
          </button>
        )}
        {r.status === "pending" && (
          <button className="link" style={{ alignSelf: "flex-start" }}
                  onClick={() => api.cancelRequest(r.id).then(load)}>
            Cancel request
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile">📨</span>
        <h1>My requests</h1>
      </div>

      {err && <p className="error">{err}</p>}

      {loading ? (
        <p className="hint">Loading your requests…</p>
      ) : requests.length === 0 ? (
        <p className="hint">No requests yet. Open “Cooks” and request a dish from a menu.</p>
      ) : (
        <>
          {active.length > 0 && <div className="list">{active.map(row)}</div>}
          {past.length > 0 && (
            <div className="list">
              <label>Past requests</label>
              {past.map(row)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
