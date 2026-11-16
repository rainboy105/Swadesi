import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type DishDetail } from "../lib/api";
import { placeOrderFlow } from "../lib/placeOrder";
import ShareButton from "../components/ShareButton";

/** A single shared dish, opened from a deep-link. Lets the viewer order it. */
export default function DishPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dish, setDish] = useState<DishDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    api
      .getListing(id)
      .then((d) => setDish(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const orderable = dish && dish.status === "open" && !dish.expired && dish.remaining > 0;

  const order = async () => {
    if (!dish) return;
    setPlacing(true);
    setError(null);
    try {
      await placeOrderFlow(dish.id, qty, dish.title);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place the order.");
    } finally {
      setPlacing(false);
    }
  };

  const distance = (m: number) => (m < 1000 ? `${m} m away` : `${(m / 1000).toFixed(1)} km away`);
  const cutoff = dish?.orderBy
    ? new Date(dish.orderBy).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="mode-panel">
      <div className="panel-head">
        <button className="icon-btn small-icon" aria-label="Back" onClick={() => navigate("/")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1>Shared dish</h1>
      </div>

      {loading ? (
        <p className="hint">Loading…</p>
      ) : notFound || !dish ? (
        <p className="hint">This dish isn't available anymore. <button className="link" onClick={() => navigate("/")}>Browse food near you →</button></p>
      ) : done ? (
        <div className="order-card">
          <p className="hint">🎉 Order placed! Track it under <button className="link" onClick={() => navigate("/")}>My orders</button>.</p>
        </div>
      ) : (
        <div className="listing dish-hero">
          {dish.hasPhoto ? (
            <img className="dish-hero-img" src={api.listingPhotoUrl(dish.id)} alt={dish.title} />
          ) : (
            <div className="dish-hero-img placeholder" aria-hidden="true">🍲</div>
          )}
          <div className="listing-main">
            <strong>
              <span className={`veg-mark ${dish.foodType}`} aria-label={dish.foodType === "veg" ? "Veg" : "Non-veg"} />
              {dish.title}
              <ShareButton id={dish.id} title={dish.title} price={dish.pricePerServing} />
            </strong>
            {dish.description && <span className="muted">{dish.description}</span>}
            <span className="meta">
              {dish.cookName ? `${dish.cookName} · ` : ""}₹{dish.pricePerServing}/serving · {dish.remaining} left
            </span>
            <span className="dist">
              {dish.distanceMeters != null ? `📍 ${distance(dish.distanceMeters)}` : ""}
              {cutoff ? ` · order by ${cutoff}` : ""}
            </span>

            {orderable ? (
              <div className="order-row">
                <div className="stepper">
                  <button disabled={qty <= 1} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                  <span>{qty}</span>
                  <button disabled={qty >= dish.remaining} onClick={() => setQty(Math.min(dish.remaining, qty + 1))}>+</button>
                </div>
                <button className="small" disabled={placing} onClick={order}>
                  {placing ? "…" : "Order"}
                </button>
              </div>
            ) : (
              <p className="hint">
                {dish.remaining < 1 ? "Sold out for now." : dish.expired ? "Ordering time has passed." : "Not available right now."}
                {" "}<button className="link" onClick={() => navigate("/")}>See more near you →</button>
              </p>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
      <p className="hint" style={{ marginTop: 12 }}>
        Hungry for more? <button className="link" onClick={() => navigate("/")}>Browse all food near you →</button>
      </p>
    </div>
  );
}
