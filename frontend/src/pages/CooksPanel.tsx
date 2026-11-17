import { useEffect, useState } from "react";
import {
  api,
  type CookNearby,
  type CookProfile,
  type DishRequest,
  type RequestStatus,
} from "../lib/api";
import { placeOrderFlow } from "../lib/placeOrder";

const statusLabel: Record<RequestStatus, string> = {
  pending: "⏳ Waiting for cook",
  accepted: "✅ Accepted — pay to confirm",
  rejected: "❌ Declined",
  cancelled: "Cancelled",
  fulfilled: "🍴 Ordered",
};

const dist = (m: number) => (m < 1000 ? `${m} m away` : `${(m / 1000).toFixed(1)} km away`);

/** Consumer: discover nearby cooks, browse their past dishes, request a dish, and pay once accepted. */
export default function CooksPanel({ onOrdered }: { onOrdered?: () => void }) {
  const [sub, setSub] = useState<"cooks" | "requests">("cooks");

  // Directory + profile.
  const [cooks, setCooks] = useState<CookNearby[]>([]);
  const [loadingCooks, setLoadingCooks] = useState(true);
  const [profile, setProfile] = useState<CookProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Per-menu-item request state: chosen servings, in-flight/sent status, and any error.
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [reqState, setReqState] = useState<Record<string, "sending" | "done">>({});
  const [formMsg, setFormMsg] = useState<string | null>(null);

  // My requests.
  const [requests, setRequests] = useState<DishRequest[]>([]);
  const [loadingReq, setLoadingReq] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [reqErr, setReqErr] = useState<string | null>(null);

  const loadCooks = () => {
    setLoadingCooks(true);
    api.cooksNearby().then(setCooks).catch(() => setCooks([])).finally(() => setLoadingCooks(false));
  };
  const loadRequests = () => {
    setLoadingReq(true);
    api.myRequests().then(setRequests).catch(() => setRequests([])).finally(() => setLoadingReq(false));
  };

  useEffect(() => {
    if (sub === "cooks" && !profile) loadCooks();
    if (sub === "requests") loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  const openCook = async (c: CookNearby) => {
    setLoadingProfile(true);
    setQtyById({}); setReqState({}); setFormMsg(null);
    try {
      setProfile(await api.cookProfile(c.cookId));
    } catch {
      setFormMsg("Couldn't open this cook.");
    } finally {
      setLoadingProfile(false);
    }
  };

  const qtyOf = (id: string) => qtyById[id] ?? 1;
  const setQty = (id: string, n: number) =>
    setQtyById((q) => ({ ...q, [id]: Math.max(1, Math.min(50, n)) }));

  const requestItem = async (item: { id: string; name: string }) => {
    if (!profile) return;
    setReqState((s) => ({ ...s, [item.id]: "sending" }));
    setFormMsg(null);
    try {
      await api.createRequest({
        cookId: profile.cookId,
        dishName: item.name,
        qty: qtyOf(item.id),
        menuItemId: item.id,
      });
      setReqState((s) => ({ ...s, [item.id]: "done" }));
    } catch (e) {
      setReqState((s) => { const c = { ...s }; delete c[item.id]; return c; });
      setFormMsg(e instanceof Error ? e.message : "Could not send the request.");
    }
  };

  const pay = async (r: DishRequest) => {
    if (!r.listingId || r.pricePerServing == null) return;
    setPayingId(r.id);
    setReqErr(null);
    try {
      await placeOrderFlow(r.listingId, r.qty, r.dishName);
      await loadRequests();
      onOrdered?.();
    } catch (e) {
      setReqErr(e instanceof Error ? e.message : "Payment could not be completed.");
    } finally {
      setPayingId(null);
    }
  };

  // ---- Cook profile + request form ----
  if (sub === "cooks" && profile) {
    return (
      <div className="mode-panel">
        <div className="panel-head">
          <button className="icon-btn small-icon" aria-label="Back" onClick={() => setProfile(null)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1>{profile.cookName}</h1>
        </div>
        {profile.distanceMeters != null && <p className="hint">📍 {dist(profile.distanceMeters)}</p>}

        {formMsg && <p className="error">{formMsg}</p>}

        {profile.menu.length === 0 ? (
          <p className="hint">{profile.cookName.split(" ")[0]} hasn't added any menu items yet.</p>
        ) : (
          <>
            <label style={{ marginTop: 8 }}>Menu — tap Request to ask {profile.cookName.split(" ")[0]} to cook it</label>
            <div className="list">
              {profile.menu.map((m) => {
                const state = reqState[m.id];
                return (
                  <div className="menu-row" key={m.id}>
                    {m.hasPhoto ? (
                      <img className="listing-thumb" src={api.menuPhotoUrl(m.id)} alt={m.name} />
                    ) : (
                      <div className="listing-thumb placeholder" aria-hidden="true">🍲</div>
                    )}
                    <div className="menu-row-main">
                      <strong>
                        <span className={`veg-mark ${m.foodType}`} aria-hidden="true" />
                        {m.name}
                      </strong>
                      {m.description && <span className="muted">{m.description}</span>}
                      <span className="meta">
                        {m.pricePerServing != null ? `~₹${m.pricePerServing}/serving` : "Price on request"}
                      </span>
                    </div>
                    <div className="menu-row-cta">
                      {state === "done" ? (
                        <span className="menu-requested">✓ Requested</span>
                      ) : (
                        <>
                          <div className="stepper tiny">
                            <button disabled={qtyOf(m.id) <= 1} onClick={() => setQty(m.id, qtyOf(m.id) - 1)}>−</button>
                            <span>{qtyOf(m.id)}</span>
                            <button disabled={qtyOf(m.id) >= 50} onClick={() => setQty(m.id, qtyOf(m.id) + 1)}>+</button>
                          </div>
                          <button className="small" disabled={state === "sending"}
                                  onClick={() => requestItem(m)}>
                            {state === "sending" ? "…" : "Request"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- Directory / My requests ----
  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile">👩‍🍳</span>
        <h1>Cooks near you</h1>
      </div>

      <div className="foodtype-filter">
        <button className={`ft-chip ${sub === "cooks" ? "on" : ""}`} onClick={() => setSub("cooks")}>Cooks</button>
        <button className={`ft-chip ${sub === "requests" ? "on" : ""}`} onClick={() => setSub("requests")}>My requests</button>
      </div>

      {sub === "cooks" ? (
        loadingCooks || loadingProfile ? (
          <p className="hint">Loading cooks nearby…</p>
        ) : cooks.length === 0 ? (
          <p className="hint">No cooks found within 10 km yet. Check back soon!</p>
        ) : (
          <div className="list">
            {cooks.map((c) => (
              <button className="order-row-btn" key={c.cookId} onClick={() => openCook(c)}>
                <div className="orb-main">
                  <strong>{c.cookName}</strong>
                  <span className="muted">{dist(c.distanceMeters)}
                    {c.menuCount > 0 ? ` · ${c.menuCount} on menu` : ` · ${c.dishCount} dish${c.dishCount === 1 ? "" : "es"}`}</span>
                </div>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          {reqErr && <p className="error">{reqErr}</p>}
          {loadingReq ? (
            <p className="hint">Loading your requests…</p>
          ) : requests.length === 0 ? (
            <p className="hint">No requests yet. Find a cook and request a dish!</p>
          ) : (
            <div className="list">
              {requests.map((r) => (
                <div className="listing" key={r.id} style={{ display: "block" }}>
                  <div className="listing-main">
                    <strong>{r.qty} × {r.dishName}</strong>
                    <span className="muted">{r.cookName ?? ""}{r.note ? ` · “${r.note}”` : ""}</span>
                    <span className="meta">{statusLabel[r.status]}
                      {r.status === "accepted" && r.pricePerServing != null
                        ? ` · ₹${r.pricePerServing * r.qty} total` : ""}</span>
                    {r.status === "accepted" && r.listingId && (
                      <button className="small" style={{ marginTop: 10, alignSelf: "flex-start" }}
                              disabled={payingId === r.id} onClick={() => pay(r)}>
                        {payingId === r.id ? "…" : `Pay ₹${(r.pricePerServing ?? 0) * r.qty}`}
                      </button>
                    )}
                    {r.status === "pending" && (
                      <button className="link" style={{ alignSelf: "flex-start" }}
                              onClick={() => api.cancelRequest(r.id).then(loadRequests)}>
                        Cancel request
                      </button>
                    )}
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
