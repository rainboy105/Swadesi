import { useEffect, useRef, useState } from "react";
import { api, type FoodType, type MenuItem } from "../lib/api";
import { downscaleToJpeg } from "../lib/image";

/** Cook: publish a menu of dishes customers can request (independent of dated listings). */
export default function MenuManager() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [foodType, setFoodType] = useState<FoodType>("veg");
  const [price, setPrice] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // "List this dish" scheduler (opening/ending time + servings) for one item.
  const [listId, setListId] = useState<string | null>(null);
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [servings, setServings] = useState("10");
  const [listBusy, setListBusy] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);
  const [listMsg, setListMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.myMenu().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const fmtLocal = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const openListForm = (m: MenuItem) => {
    setListId(m.id);
    setListErr(null); setListMsg(null);
    setServings("10");
    const close = new Date(Date.now() + 2 * 60 * 60 * 1000);
    close.setMinutes(0, 0, 0);
    setOpenAt("");                 // blank = available immediately
    setCloseAt(fmtLocal(close));
  };

  const listNow = async (m: MenuItem) => {
    if (m.pricePerServing == null) return setListErr("Add a price to this item first (edit it).");
    if (!closeAt) return setListErr("Set an ending time (when orders close).");
    const s = parseInt(servings, 10);
    if (!Number.isFinite(s) || s < 1) return setListErr("How many servings can you make?");
    const closeIso = new Date(closeAt).toISOString();
    if (new Date(closeIso).getTime() <= Date.now()) return setListErr("Ending time must be in the future.");
    const openIso = openAt ? new Date(openAt).toISOString() : null;
    if (openIso && new Date(closeIso) <= new Date(openIso)) return setListErr("Ending time must be after the opening time.");
    setListBusy(true);
    setListErr(null);
    try {
      await api.listFromMenu(m.id, { availableFrom: openIso, orderBy: closeIso, maxServings: s });
      setListId(null);
      setListMsg(`✅ Listed “${m.name}”.`);
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "Could not list this dish.");
    } finally {
      setListBusy(false);
    }
  };

  const resetForm = () => {
    setName(""); setDescription(""); setFoodType("veg"); setPrice("");
    setPhoto(null); setPhotoPreview(null);
    setEditingId(null); setError(null);
  };

  const pickPhoto = (f: File | null) => {
    setPhoto(f);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const startEdit = (m: MenuItem) => {
    setEditingId(m.id);
    setName(m.name);
    setDescription(m.description ?? "");
    setFoodType(m.foodType);
    setPrice(m.pricePerServing != null ? String(m.pricePerServing) : "");
    setPhoto(null); setPhotoPreview(null);
    setShowForm(true);
    setError(null);
  };

  const submit = async () => {
    if (!name.trim()) return setError("What's the dish called?");
    const p = price.trim() ? parseInt(price, 10) : null;
    if (p != null && (!Number.isFinite(p) || p < 0)) return setError("Enter a valid price, or leave it blank.");
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), description: description.trim() || null, foodType, pricePerServing: p };
    try {
      const saved = editingId ? await api.updateMenuItem(editingId, body) : await api.addMenuItem(body);
      if (photo) {
        try {
          await api.uploadMenuPhoto(saved.id, await downscaleToJpeg(photo));
        } catch { /* keep the item even if the photo fails */ }
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

  const toggleAvailable = async (m: MenuItem) => {
    try {
      await api.updateMenuItem(m.id, {
        name: m.name, description: m.description, foodType: m.foodType,
        pricePerServing: m.pricePerServing, available: !m.available,
      });
      await load();
    } catch { /* ignore */ }
  };

  const remove = async (m: MenuItem) => {
    if (!window.confirm(`Remove "${m.name}" from your menu?`)) return;
    try {
      await api.deleteMenuItem(m.id);
      await load();
    } catch { /* ignore */ }
  };

  return (
    <div className="mode-panel">
      <div className="panel-head">
        <span className="tile marigold">📋</span>
        <h1>Your menu</h1>
      </div>
      <p className="hint">Dishes customers can request from your profile. Set the price when you accept a request.</p>

      {!showForm && <button onClick={openCreate}>+ Add a menu item</button>}

      {showForm && (
        <div className="form-block">
          {editingId && <strong className="form-title">Edit item</strong>}
          <label>Dish <span className="req">*</span></label>
          <input placeholder="e.g. Paneer Thali" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <label>Description (optional)</label>
          <input placeholder="Dal, rice, 2 sabzi, roti" value={description} onChange={(e) => setDescription(e.target.value)} />
          <label>Food type <span className="req">*</span></label>
          <div className="foodtype-toggle">
            {(["veg", "nonveg"] as FoodType[]).map((ft) => (
              <button type="button" key={ft} className={`ft-btn ${ft} ${foodType === ft ? "on" : ""}`}
                      aria-pressed={foodType === ft} onClick={() => setFoodType(ft)}>
                <span className={`veg-mark ${ft}`} aria-hidden="true" />
                {ft === "veg" ? "Veg" : "Non-veg"}
              </button>
            ))}
          </div>
          <label>Indicative price / serving (₹, optional)</label>
          <input inputMode="numeric" placeholder="120" value={price} onChange={(e) => setPrice(e.target.value)} />
          <label>Photo {editingId ? "(replace, optional)" : "(optional)"}</label>
          <input ref={fileRef} type="file" accept="image/*"
                 onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} />
          {photoPreview
            ? <img className="photo-preview" src={photoPreview} alt="Dish preview" />
            : editingId && items.find((i) => i.id === editingId)?.hasPhoto
              ? <img className="photo-preview" src={api.menuPhotoUrl(editingId)} alt="Current photo" />
              : null}
          <button disabled={busy} onClick={submit}>
            {busy ? "Saving…" : editingId ? "Save changes" : "Add to menu"}
          </button>
          <button className="link" onClick={() => { resetForm(); setShowForm(false); }}>Cancel</button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="hint">Loading your menu…</p>
      ) : items.length === 0 ? (
        <p className="hint">No menu items yet. Add dishes customers can request.</p>
      ) : (
        <div className="list">
          {listMsg && <p className="loc-ok">{listMsg}</p>}
          {items.map((m) => (
            <div key={m.id}>
            <div className={`listing ${m.available ? "" : "dim"}`}>
              {m.hasPhoto ? (
                <img className="listing-thumb" src={api.menuPhotoUrl(m.id)} alt={m.name} />
              ) : (
                <div className="listing-thumb placeholder" aria-hidden="true">🍲</div>
              )}
              <div className="listing-main">
                <strong>
                  <span className={`veg-mark ${m.foodType}`} aria-label={m.foodType === "veg" ? "Veg" : "Non-veg"} />
                  {m.name}
                </strong>
                {m.description && <span className="muted">{m.description}</span>}
                <span className="meta">
                  {m.pricePerServing != null ? `~₹${m.pricePerServing}/serving` : "Price on request"}
                  {m.available ? "" : " · hidden"}
                </span>
              </div>
              <div className="order-actions">
                <button className="small" onClick={() => (listId === m.id ? setListId(null) : openListForm(m))}>
                  {listId === m.id ? "Close" : "List"}
                </button>
                <button className="icon-btn small-icon" aria-label="Edit item" onClick={() => startEdit(m)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button className="secondary small" onClick={() => toggleAvailable(m)}>
                  {m.available ? "Hide" : "Show"}
                </button>
                <button className="link" onClick={() => remove(m)}>Remove</button>
              </div>
            </div>

            {listId === m.id && (
              <div className="form-block">
                <strong className="form-title">List “{m.name}” for a time slot</strong>
                <span className="muted">Name, price{m.hasPhoto ? ", photo" : ""} and type are reused from your menu.</span>
                <label>Opening time <span style={{ fontWeight: 400 }}>(leave blank = available now)</span></label>
                <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
                <label>Ending time <span className="req">*</span> <span style={{ fontWeight: 400 }}>(orders close)</span></label>
                <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
                <label>Servings (cap) <span className="req">*</span></label>
                <input inputMode="numeric" placeholder="10" value={servings} onChange={(e) => setServings(e.target.value)} />
                <button disabled={listBusy} onClick={() => listNow(m)}>
                  {listBusy ? "Listing…" : "List this dish"}
                </button>
                {listErr && <p className="error">{listErr}</p>}
              </div>
            )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
