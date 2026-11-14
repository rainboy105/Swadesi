import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { api, type Settlement } from "../lib/api";
import AppHeader from "../components/AppHeader";

/** Admin page: completed orders whose money is owed to cooks. Pay by UPI, then mark settled. */
export default function Settlements() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Settlement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState<Record<string, string>>({});

  const showQr = async (s: Settlement) => {
    const url = payUrl(s, "upi://pay");
    if (!url) return;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 });
      setQr((m) => ({ ...m, [s.orderId]: dataUrl }));
    } catch {
      /* ignore */
    }
  };

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

  // Build a UPI pay URL for a given app scheme. Paytm restricts browser-launched upi:// intents
  // (the "₹2,000 / scan QR" nag), so we offer GPay (tez://) and PhonePe (phonepe://) which don't.
  const payUrl = (s: Settlement, scheme: string) => {
    if (!s.cookUpi) return undefined;
    const q = new URLSearchParams({
      pa: s.cookUpi,
      pn: s.cookName ?? "Cook",
      am: (s.amountPaise / 100).toFixed(2),
      cu: "INR",
      tn: `Swaadesi ${s.dish}`.slice(0, 50),
      tr: "SWD" + s.orderId.replace(/-/g, "").slice(0, 20),
    }).toString();
    return `${scheme}?${q}`;
  };

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
                {s.cookUpi && (
                  <div className="pay-apps">
                    <a className="pay-app gpay" href={payUrl(s, "tez://upi/pay")}>GPay</a>
                    <a className="pay-app phonepe" href={payUrl(s, "phonepe://pay")}>PhonePe</a>
                    <button className="pay-app upi" onClick={() => showQr(s)}>Show QR</button>
                  </div>
                )}
                {qr[s.orderId] && (
                  <div className="qr-box">
                    <img src={qr[s.orderId]} alt="UPI QR" />
                    <span className="muted">Scan with any UPI app (another phone), or in your
                      UPI app use "Pay via QR → upload from gallery".</span>
                  </div>
                )}
                <div className="order-row">
                  <button className="small" onClick={() => markPaid(s.orderId)}>
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
