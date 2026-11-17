import { useEffect, useRef, useState } from "react";
import { api, type Listing, type Order, type Me, type FoodType, type MenuItem } from "../lib/api";
import { downscaleToJpeg } from "../lib/image";
import LocationPicker, { type PickedLocation } from "../components/LocationPicker";
import ShareButton from "../components/ShareButton";

/** Cook mode: create a dish (with serving cap + order cutoff), manage listings, handle orders. */
export default function CookPanel({ me, onMe, view }: {
  me: Me;
  onMe: (me: Me) => void;
  view: "kitchen" | "orders";
}) {
  const [upiInput, setUpiInput] = useState("");
  const [upiBusy, setUpiBusy] = useState(false);
  const [upiErr, setUpiErr] = useState<string | null>(null);

  const saveUpi = async () => {
    setUpiBusy(true);
    setUpiErr(null);
    try {
      onMe(await api.setPayout(upiInput.trim()));
      setUpiInput("");
    } catch (e) {
      setUpiErr(e instanceof Error ? e.message : "Could not save UPI.");
    } finally {
      setUpiBusy(false);
    }
  };
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [servings, setServings] = useState("");
  const [orderBy, setOrderBy] = useState("");
  const [foodType, setFoodType] = useState<FoodType>("veg");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // "List a dish" = pick from the menu, then set timing + servings (manual entry still available).
  const [showPicker, setShowPicker] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [pickedMenu, setPickedMenu] = useState<MenuItem | null>(null);
  const [slotOpenAt, setSlotOpenAt] = useState("");
  const [slotServings, setSlotServings] = useState("10");
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotErr, setSlotErr] = useState<string | null>(null);

  // Pickup location for the dish being created/edited, and whether the map is open.
  const [pickup, setPickup] = useState<PickedLocation | null>(null);
  const [pickupEditing, setPickupEditing] = useState(false);

  // Kitchen (pickup) location setup.
  const [kitchenEditing, setKitchenEditing] = useState(false);
  const [kitchenPick, setKitchenPick] = useState<PickedLocation | null>(null);
  const [kitchenBusy, setKitchenBusy] = useState(false);
  const [kitchenErr, setKitchenErr] = useState<string | null>(null);

  // The cook's default pickup point: their saved kitchen, else their society/home.
  const defaultPickup = (): PickedLocation | null =>
    me.kitchenLat != null && me.kitchenLng != null
      ? { lat: me.kitchenLat, lng: me.kitchenLng, address: me.kitchenAddress }
      : me.lat != null && me.lng != null
        ? { lat: me.lat, lng: me.lng, address: me.addressText }
        : null;

  const society = me.lat != null && me.lng != null ? { lat: me.lat, lng: me.lng } : null;

  const saveKitchen = async () => {
    if (!kitchenPick) return setKitchenErr("Pick your kitchen on the map.");
    setKitchenBusy(true);
    setKitchenErr(null);
    try {
      onMe(await api.setKitchen(kitchenPick.lat, kitchenPick.lng, kitchenPick.address ?? "Kitchen location"));
      setKitchenEditing(false);
    } catch (e) {
      setKitchenErr(e instanceof Error ? e.message : "Could not save kitchen location.");
    } finally {
      setKitchenBusy(false);
    }
  };

  const fmtLocal = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const toLocalInput = (iso: string | null) => (iso ? fmtLocal(new Date(iso)) : "");
  // Earliest selectable time = 5 minutes from now (no past cutoffs).
  // Default when opening a fresh listing: 2 hours from now, on the hour.
  const defaultOrderBy = () => {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return fmtLocal(d);
  };

  // --- Day + Time dropdowns (replace the native datetime picker) ---
  const dateKey = (d: Date) => fmtLocal(d).split("T")[0];
  const dayPart = (local: string) => (local ? local.split("T")[0] : "");
  const timePart = (local: string) => (local ? local.split("T")[1] : "");

  // Next 5 days as options.
  const dayOptions = Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow"
      : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    return { value: dateKey(d), label };
  });

  // Hourly time slots; for today, only hours at least 1 hour from now (no past times).
  const timeOptions = (day: string) => {
    const now = new Date();
    const isToday = day === dateKey(now);
    const earliestHour = isToday ? now.getHours() + 1 : 0; // 1-hour minimum lead
    const out: { value: string; label: string }[] = [];
    for (let h = earliestHour; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      const label = new Date(2000, 0, 1, h, 0).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      out.push({ value: `${hh}:00`, label });
    }
    return out;
  };

  const setDay = (day: string) => {
    const opts = timeOptions(day);
    const t = timePart(orderBy);
    const stillValid = opts.some((o) => o.value === t);
    setOrderBy(`${day}T${stillValid ? t : opts[0]?.value ?? "12:00"}`);
  };
  const setTime = (t: string) => setOrderBy(`${dayPart(orderBy) || dateKey(new Date())}T${t}`);

  const prettyWhen = (local: string) => {
    if (!local) return "";
    const d = new Date(local);
    return d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setPrice(""); setServings(""); setOrderBy("");
    setFoodType("veg");
    setPhoto(null); setPhotoPreview(null); setEditingId(null); setError(null);
    setPickup(null); setPickupEditing(false);
  };

  const openCreate = () => {
    resetForm();
    setOrderBy(defaultOrderBy());
    setPickup(defaultPickup()); // default pickup = kitchen (or society)
    setShowForm(true);
  };

  // Open the menu picker: choose a saved dish, then just set its time window + servings.
  const openPicker = () => {
    setSlotErr(null);
    setPickedMenu(null);
    api.myMenu().then((m) => setMenuItems(m.filter((i) => i.available))).catch(() => setMenuItems([]));
    setShowPicker(true);
  };

  const pickMenu = (m: MenuItem) => {
    setSlotErr(null);
    setPickedMenu(m);
    setSlotOpenAt("");               // blank = available now
    setSlotServings("10");
    setOrderBy(defaultOrderBy());    // reuse the day/time dropdowns for the ending time
  };

  const listPicked = async () => {
    if (!pickedMenu) return;
    if (pickedMenu.pricePerServing == null) return setSlotErr("Add a price to this dish first (in Menu).");
    const s = parseInt(slotServings, 10);
    if (!Number.isFinite(s) || s < 1) return setSlotErr("How many servings can you make?");
    if (!orderBy) return setSlotErr("Set an ending (order-by) time.");
    const closeIso = new Date(orderBy).toISOString();
    if (new Date(closeIso).getTime() <= Date.now()) return setSlotErr("Ending time must be in the future.");
    const openIso = slotOpenAt ? new Date(slotOpenAt).toISOString() : null;
    if (openIso && new Date(closeIso) <= new Date(openIso)) return setSlotErr("Ending time must be after the opening time.");
    setSlotBusy(true);
    setSlotErr(null);
    try {
      await api.listFromMenu(pickedMenu.id, { availableFrom: openIso, orderBy: closeIso, maxServings: s });
      setShowPicker(false);
      setPickedMenu(null);
      await load();
    } catch (e) {
      setSlotErr(e instanceof Error ? e.message : "Could not list this dish.");
    } finally {
      setSlotBusy(false);
    }
  };

  const startEdit = (l: Listing) => {
    setEditingId(l.id);
    setTitle(l.title);
    setDescription(l.description ?? "");
    setPrice(String(l.pricePerServing));
    setServings(String(l.maxServings));
    setOrderBy(toLocalInput(l.orderBy));
    setFoodType(l.foodType);
    setPhoto(null); setPhotoPreview(null);
    // Keep this listing's existing pickup point unless the cook changes it.
    setPickup({ lat: l.pickupLat, lng: l.pickupLng, address: l.pickupAddress });
    setPickupEditing(false);
    setShowForm(true);
    setError(null);
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [mine, recv] = await Promise.all([api.myListings(), api.receivedOrders()]);
      setListings(mine);
      setOrders(recv);
    } catch {
      /* ignore */
    } finally {
      if (!silent) setLoading(false);
    }
  };
  const load = () => fetchData(false);

  // Initial load + silent auto-refresh (poll while visible, and on tab focus).
  useEffect(() => {
    fetchData(false);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchData(true);
    }, 12000);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchData(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
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
    if (!pickup) return setError("Set a pickup location for this dish.");
    const body = {
      title: title.trim(),
      description: description.trim(),
      pricePerServing: p,
      maxServings: s,
      foodType,
      readyBy: null,
      orderBy: new Date(orderBy).toISOString(),
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      pickupAddress: pickup.address,
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

  // Advance every order of one dish by a step (accept / prepare / ready) in one tap.
  const bulkDecide = async (listingId: string, status: Order["status"]) => {
    try {
      await api.bulkOrderStatus(listingId, status);
      await load();
    } catch {
      /* ignore */
    }
  };

  const activeAll = orders.filter(
    (o) => o.status === "requested" || o.status === "accepted" || o.status === "preparing" || o.status === "ready",
  );
  // Group active orders by dish so the cook manages a whole dish at once.
  const dishGroups = Object.values(
    activeAll.reduce<Record<string, { listingId: string; title: string; items: Order[] }>>((acc, o) => {
      (acc[o.listingId] ??= { listingId: o.listingId, title: o.listingTitle, items: [] }).items.push(o);
      return acc;
    }, {}),
  );
  const history = orders.filter((o) => o.status === "completed" || o.status === "rejected" || o.status === "cancelled");
  const histLabel: Record<string, string> = {
    completed: "🍴 Completed",
    rejected: "❌ Declined",
    cancelled: "Cancelled",
  };
  const timeOf = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

  // ---- Orders view: incoming orders to manage ----
  if (view === "orders") {
    return (
      <div className="mode-panel">
        <div className="panel-head">
          <span className="tile marigold">📦</span>
          <h1>Orders</h1>
          <button className="link refresh" onClick={load} aria-label="Refresh">↻</button>
        </div>

        {dishGroups.length === 0 && history.length === 0 && (
          <p className="hint">No orders yet. They'll show up here when customers order.</p>
        )}

        {dishGroups.map((g) => {
          const requested = g.items.filter((o) => o.status === "requested");
          const accepted = g.items.filter((o) => o.status === "accepted");
          const preparing = g.items.filter((o) => o.status === "preparing");
          const statusText: Record<string, string> = {
            requested: "⏳ New",
            accepted: "✅ Accepted",
            preparing: "👨‍🍳 Preparing",
            ready: "🛍️ Ready",
          };
          return (
            <div className="dish-group" key={g.listingId}>
              <div className="dish-group-head">
                <strong>{g.title}</strong>
                <span className="muted">{g.items.length} order{g.items.length > 1 ? "s" : ""}</span>
              </div>

              {/* One tap moves every order of this dish forward a step. */}
              <div className="dish-actions">
                {requested.length > 0 && (
                  <button className="small" onClick={() => bulkDecide(g.listingId, "accepted")}>
                    Accept all ({requested.length})
                  </button>
                )}
                {accepted.length > 0 && (
                  <button className="small" onClick={() => bulkDecide(g.listingId, "preparing")}>
                    Start preparing ({accepted.length})
                  </button>
                )}
                {preparing.length > 0 && (
                  <button className="small" onClick={() => bulkDecide(g.listingId, "ready")}>
                    Mark all ready ({preparing.length})
                  </button>
                )}
              </div>

              {/* Each customer is a separate order with its own pickup code. */}
              <div className="dish-orders">
                {g.items.map((o) => (
                  <div className="dish-order" key={o.id}>
                    <div className="dish-order-row">
                      <span className="dish-order-main">
                        <strong>{o.qty} ×</strong> {o.consumerName ?? "Customer"}
                      </span>
                      <span className={`status-pill s-${o.status}`}>{statusText[o.status]}</span>
                      {o.status === "requested" && (
                        <button className="secondary small" onClick={() => decide(o, "rejected")}>Reject</button>
                      )}
                    </div>
                    {o.status === "ready" && (
                      <div className="pickup-confirm">
                        <span className="muted">Enter {o.consumerName ?? "the customer"}'s pickup code:</span>
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
            </div>
          );
        })}

        {history.length > 0 && (
          <div className="orders-block history">
            <label>Past orders</label>
            {history.map((o) => (
              <div className="profile-row" key={o.id}>
                <span>{o.qty} × {o.listingTitle}{o.consumerName ? ` · ${o.consumerName}` : ""}</span>
                <strong>{histLabel[o.status]}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Kitchen view: UPI + create + my listings ----
  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile marigold">🍳</span>
        <h1>Your kitchen</h1>
      </div>

      {/* Cooks need a UPI to get paid when an order is picked up. */}
      {!me.upiId ? (
        <div className="upi-setup">
          <strong>💸 Add your UPI to get paid</strong>
          <span className="muted">Order money is sent here when a customer picks up.</span>
          <div className="order-row">
            <input
              placeholder="name@okhdfcbank"
              value={upiInput}
              onChange={(e) => setUpiInput(e.target.value)}
            />
            <button className="small" disabled={upiBusy || !upiInput.trim()} onClick={saveUpi}>
              {upiBusy ? "…" : "Save"}
            </button>
          </div>
          {upiErr && <span className="error-inline">{upiErr}</span>}
        </div>
      ) : (
        <div className="upi-ok">💸 Payouts to <strong>{me.upiId}</strong></div>
      )}

      {/* Kitchen (pickup) location — where customers collect dishes. */}
      {!kitchenEditing ? (
        <div className="upi-ok kitchen-ok">
          <span>🍳 Pickup at <strong>{me.kitchenAddress ?? me.addressText ?? "your society (default)"}</strong></span>
          <button className="secondary small" onClick={() => { setKitchenPick(defaultPickup()); setKitchenEditing(true); }}>
            {me.kitchenAddress ? "Change" : "Set kitchen"}
          </button>
        </div>
      ) : (
        <div className="upi-setup">
          <strong>🍳 Set your kitchen (pickup) location</strong>
          <span className="muted">Customers come here to collect. Defaults to your society.</span>
          <LocationPicker
            value={kitchenPick}
            onChange={setKitchenPick}
            savedCoords={society}
            savedLabel="Use my society"
          />
          <div className="order-row">
            <button className="small" disabled={kitchenBusy} onClick={saveKitchen}>
              {kitchenBusy ? "…" : "Save kitchen"}
            </button>
            <button className="secondary small" onClick={() => setKitchenEditing(false)}>Cancel</button>
          </div>
          {kitchenErr && <span className="error-inline">{kitchenErr}</span>}
        </div>
      )}

      {!showForm && !showPicker && <button onClick={openPicker}>+ List a dish</button>}

      {showPicker && (
        <div className="form-block">
          <strong className="form-title">List a dish</strong>
          {!pickedMenu ? (
            <>
              {menuItems.length === 0 ? (
                <p className="hint">Your menu is empty. Add dishes in the Menu tab, or type one manually below.</p>
              ) : (
                <>
                  <span className="muted">Choose from your menu:</span>
                  <div className="list">
                    {menuItems.map((m) => (
                      <button className="order-row-btn" key={m.id} onClick={() => pickMenu(m)}>
                        <div className="orb-main">
                          <strong>
                            <span className={`veg-mark ${m.foodType}`} aria-hidden="true" /> {m.name}
                          </strong>
                          <span className="muted">
                            {m.pricePerServing != null ? `~₹${m.pricePerServing}/serving` : "No price set"}
                          </span>
                        </div>
                        <span className="chev">›</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button className="link" onClick={() => { setShowPicker(false); openCreate(); }}>
                Type a new dish manually
              </button>
              <button className="link" onClick={() => setShowPicker(false)}>Cancel</button>
            </>
          ) : (
            <>
              <span className="muted">
                <span className={`veg-mark ${pickedMenu.foodType}`} aria-hidden="true" /> <strong>{pickedMenu.name}</strong>
                {pickedMenu.pricePerServing != null ? ` · ₹${pickedMenu.pricePerServing}/serving` : ""} — name, price & photo reused.
              </span>
              <label>Opening time <span style={{ fontWeight: 400 }}>(leave blank = available now)</span></label>
              <input type="datetime-local" value={slotOpenAt} onChange={(e) => setSlotOpenAt(e.target.value)} />
              <label>Order by <span className="req">*</span> <span style={{ fontWeight: 400 }}>(orders close at this time)</span></label>
              <div className="dt-row">
                <select value={dayPart(orderBy)} onChange={(e) => setDay(e.target.value)}>
                  {dayOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
                <select value={timePart(orderBy)} onChange={(e) => setTime(e.target.value)}>
                  {timeOptions(dayPart(orderBy) || dayOptions[0].value).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {orderBy && <span className="when-note">⏰ Orders close {prettyWhen(orderBy)}</span>}
              <label>Servings (cap) <span className="req">*</span></label>
              <input inputMode="numeric" placeholder="10" value={slotServings} onChange={(e) => setSlotServings(e.target.value)} />
              <button disabled={slotBusy} onClick={listPicked}>
                {slotBusy ? "Listing…" : "List this dish"}
              </button>
              <button className="link" onClick={() => setPickedMenu(null)}>← Choose a different dish</button>
              {slotErr && <p className="error">{slotErr}</p>}
            </>
          )}
        </div>
      )}

      {showForm && (
        <div className="form-block">
          {editingId && <strong className="form-title">Edit dish</strong>}
          <label>Dish <span className="req">*</span></label>
          <input placeholder="e.g. Veg Thali" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <label>Description (optional)</label>
          <input placeholder="Dal, rice, 2 sabzi, roti" value={description} onChange={(e) => setDescription(e.target.value)} />
          <label>Food type <span className="req">*</span></label>
          <div className="foodtype-toggle">
            {(["veg", "nonveg"] as FoodType[]).map((ft) => (
              <button
                type="button"
                key={ft}
                className={`ft-btn ${ft} ${foodType === ft ? "on" : ""}`}
                aria-pressed={foodType === ft}
                onClick={() => setFoodType(ft)}
              >
                <span className={`veg-mark ${ft}`} aria-hidden="true" />
                {ft === "veg" ? "Veg" : "Non-veg"}
              </button>
            ))}
          </div>
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
          <label>Order by <span className="req">*</span> <span style={{ fontWeight: 400 }}>(orders close at this time)</span></label>
          <div className="dt-row">
            <select value={dayPart(orderBy)} onChange={(e) => setDay(e.target.value)}>
              {dayOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select value={timePart(orderBy)} onChange={(e) => setTime(e.target.value)}>
              {timeOptions(dayPart(orderBy) || dayOptions[0].value).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {orderBy && <span className="when-note">⏰ Orders close {prettyWhen(orderBy)}</span>}

          <label>Pickup location <span className="req">*</span></label>
          <div className="pickup-box">
            <span className="pickup-current">
              📍 {pickup?.address ?? (pickup ? "Pinned location" : "Not set")}
            </span>
            <button type="button" className="link" onClick={() => setPickupEditing((v) => !v)}>
              {pickupEditing ? "Done" : "Change for this dish"}
            </button>
          </div>
          {pickupEditing && (
            <LocationPicker
              value={pickup}
              onChange={setPickup}
              savedCoords={society}
              savedLabel="Use my society"
            />
          )}

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

      {/* My listings */}
      {loading ? (
        <p className="hint">Loading your listings…</p>
      ) : listings.length === 0 ? (
        <p className="hint">No listings yet. Post what you're cooking today.</p>
      ) : (
        <div className="list">
          {listings.map((l) => {
            const cutoff = timeOf(l.orderBy);
            const scheduled = l.availableFrom != null && new Date(l.availableFrom).getTime() > Date.now();
            return (
              <div className={`listing ${l.status === "closed" || l.expired ? "dim" : ""}`} key={l.id}>
                {l.hasPhoto ? (
                  <img className="listing-thumb" src={api.listingPhotoUrl(l.id)} alt={l.title} />
                ) : (
                  <div className="listing-thumb placeholder" aria-hidden="true">🍲</div>
                )}
                <div className="listing-main">
                  <strong>
                    <span className={`veg-mark ${l.foodType}`} aria-label={l.foodType === "veg" ? "Veg" : "Non-veg"} />
                    {l.title}
                    <ShareButton id={l.id} title={l.title} price={l.pricePerServing} />
                  </strong>
                  {l.description && <span className="muted">{l.description}</span>}
                  <span className="meta">
                    ₹{l.pricePerServing}/serving · {l.remaining}/{l.maxServings} left
                    {cutoff ? ` · order by ${cutoff}` : ""}
                    {scheduled ? ` · opens ${prettyWhen(toLocalInput(l.availableFrom))}` : ""}
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
