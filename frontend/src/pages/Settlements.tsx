import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Settlement } from "../lib/api";
import AppHeader from "../components/AppHeader";

/** Admin page: completed orders whose money is owed to cooks. Pay by UPI, then mark settled. */
export default function Settlements() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Settlement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.settlements();
      setRows(d.pending);
      setTotal(d.totalOwedPaise);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const markPaid = async (orderId: string) => {
    try {
      await api.markPaidOut(orderId);
      await load();
    } catch {
      /* ignore */
    }
  };

  const upiLink = (s: Settlement) =>
    s.cookUpi
      ? "upi://pay?" +
        new URLSearchParams({
          pa: s.cookUpi,
          pn: s.cookName ?? "Cook",
          am: (s.amountPaise / 100).toFixed(2),
          cu: "INR",
          tn: `Swaadesi ${s.dish}`.slice(0, 50),
          tr: "SWD" + s.orderId.replace(/-/g, "").slice(0, 20),
        }).toString()
      : undefined;

  return (
    <>
      <AppHeader
        title="Cook settlements"
        subtitle="Money owed to cooks"
        showProfile={false}
        onBack={() => navigate("/")}
      />
      <div className="card">
        <div className="profile-row">
          <span>Total owed</span>
          <strong>₹{(total / 100).toFixed(2)}</strong>
        </div>

        {loading ? (
          <p className="hint">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="hint">All settled — nothing owed right now. 🎉</p>
        ) : (
          <div className="list">
            {rows.map((s) => (
              <div className="listing col" key={s.orderId}>
                <div className="listing-main">
                  <strong>₹{(s.amountPaise / 100).toFixed(2)} · {s.qty} × {s.dish}</strong>
                  <span className="muted">{s.cookName ?? "Cook"}</span>
                  {s.cookUpi ? (
                    <button
                      className="copy-upi"
                      onClick={() => {
                        navigator.clipboard?.writeText(s.cookUpi!).catch(() => undefined);
                        setCopied(s.orderId);
                        setTimeout(() => setCopied(null), 1500);
                      }}
                    >
                      UPI: {s.cookUpi} {copied === s.orderId ? "✓ copied" : "📋"}
                    </button>
                  ) : (
                    <span className="meta">UPI: — not set by cook —</span>
                  )}
                </div>
                <div className="order-row">
                  {upiLink(s) && (
                    <a className="map-dir" href={upiLink(s)}>Pay via UPI</a>
                  )}
                  <button className="secondary small" onClick={() => markPaid(s.orderId)}>
                    Mark paid
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="link" onClick={() => navigate("/")}>Back to home</button>
      </div>
    </>
  );
}
