import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../lib/api";

export interface PickedLocation {
  lat: number;
  lng: number;
  address: string | null;
}

interface Hit {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Pick a point on a map: search by name, tap/drag the pin, use current GPS, or reuse a saved
 * location (e.g. "my society"). Reverse-geocodes the chosen point to a readable address.
 */
export default function LocationPicker({
  value,
  onChange,
  savedCoords,
  savedLabel = "Use my society",
  defaultCenter = [20.5937, 78.9629], // India, if nothing else is known
  autoLocate = false,
}: {
  value: PickedLocation | null;
  onChange: (v: PickedLocation) => void;
  savedCoords?: { lat: number; lng: number } | null;
  savedLabel?: string;
  defaultCenter?: [number, number];
  /** On first open with no value/saved point, jump straight to the user's GPS location. */
  autoLocate?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [address, setAddress] = useState<string | null>(value?.address ?? null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);

  // Search box.
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const pinIcon = L.divIcon({
    className: "",
    html: '<div style="font-size:30px;line-height:1;transform:translate(-2px,-6px)">📍</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  });

  // Reverse-geocode a point, update the shown address, and bubble the pick upward.
  const commit = async (lat: number, lng: number) => {
    onChange({ lat, lng, address });
    setResolving(true);
    try {
      const { address: resolved } = await api.reverseGeocode(lat, lng);
      const a = resolved && resolved.trim() ? resolved : null;
      setAddress(a);
      onChange({ lat, lng, address: a });
    } catch {
      setAddress(null);
    } finally {
      setResolving(false);
    }
  };

  const moveTo = (lat: number, lng: number, recenter = true) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        commit(p.lat, p.lng);
      });
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (recenter) map.setView([lat, lng], Math.max(map.getZoom(), 16));
  };

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const start: [number, number] = value
      ? [value.lat, value.lng]
      : savedCoords
        ? [savedCoords.lat, savedCoords.lng]
        : defaultCenter;
    const map = L.map(ref.current, { attributionControl: true, zoomControl: true })
      .setView(start, value || savedCoords ? 16 : 5);
    // Keyless OpenStreetMap raster tiles.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      moveTo(e.latlng.lat, e.latlng.lng, false);
      commit(e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;
    if (value) moveTo(value.lat, value.lng, false);
    // Leaflet needs a size recalc once its container is laid out.
    setTimeout(() => map.invalidateSize(), 0);
    // Fresh pick (onboarding): jump to the user's GPS so they land on their own society.
    if (autoLocate && !value && !savedCoords) {
      setTimeout(() => useGps(), 120);
    }
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced place search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        // Bias results toward what the map is currently showing (local-first).
        const c = mapRef.current?.getCenter();
        const r = await api.searchPlaces(q, c ? { lat: c.lat, lng: c.lng } : undefined);
        setHits(r);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const choose = (h: Hit) => {
    setQuery(h.label.split(",").slice(0, 2).join(",").trim());
    setOpen(false);
    setHits([]);
    moveTo(h.lat, h.lng);
    commit(h.lat, h.lng);
  };

  const useGps = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        moveTo(pos.coords.latitude, pos.coords.longitude);
        commit(pos.coords.latitude, pos.coords.longitude);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const useSaved = () => {
    if (!savedCoords) return;
    moveTo(savedCoords.lat, savedCoords.lng);
    commit(savedCoords.lat, savedCoords.lng);
  };

  return (
    <div className="loc-picker">
      <div className="loc-search">
        <input
          type="text"
          placeholder="Search your society, area, landmark…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
        />
        {open && (searching || query.trim().length >= 3) && (
          <ul className="loc-results">
            {searching && <li className="loc-result muted">Searching…</li>}
            {!searching && hits.length === 0 && (
              <li className="loc-result muted">
                No match. Try your area or a nearby landmark, then drag the pin to your spot.
              </li>
            )}
            {hits.map((h, i) => (
              <li key={i} className="loc-result" onClick={() => choose(h)}>
                {h.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="loc-map-wrap">
        <div ref={ref} className="loc-canvas" />
        <button type="button" className="loc-locate" disabled={locating} onClick={useGps}
                aria-label="Go to my current location" title="My current location">
          {locating ? (
            <span className="loc-locate-spin">◌</span>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="7" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
            </svg>
          )}
        </button>
      </div>

      {savedCoords && (
        <div className="loc-actions">
          <button type="button" className="secondary small" onClick={useSaved}>
            🏠 {savedLabel}
          </button>
        </div>
      )}

      <span className="loc-address">
        {resolving ? "Finding address…" : address ? `📌 ${address}` : "Search, tap the map, or use a button to set the location"}
      </span>
    </div>
  );
}
