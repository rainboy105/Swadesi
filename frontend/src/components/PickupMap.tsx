import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Pickup map: the cook's location, the consumer's live location (watched), a dotted line
 * between them, and a "Directions" button that opens turn-by-turn navigation in Google Maps.
 */
export default function PickupMap({ cookLat, cookLng, title }: {
  cookLat: number;
  cookLng: number;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  const cookIcon = L.divIcon({
    className: "",
    html: '<div style="font-size:26px;line-height:1">🍳</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
  const userIcon = L.divIcon({
    className: "",
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#7c3aed;border:3px solid #fff;box-shadow:0 0 0 2px #7c3aed"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { attributionControl: true, zoomControl: true }).setView(
      [cookLat, cookLng],
      16,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    L.marker([cookLat, cookLng], { icon: cookIcon }).addTo(map).bindPopup(`Pickup: ${title}`);
    mapRef.current = map;

    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const u: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          if (!userMarkerRef.current) {
            userMarkerRef.current = L.marker(u, { icon: userIcon }).addTo(map).bindPopup("You");
          } else {
            userMarkerRef.current.setLatLng(u);
          }
          const pts: [number, number][] = [u, [cookLat, cookLng]];
          if (!lineRef.current) {
            lineRef.current = L.polyline(pts, { color: "#7c3aed", weight: 3, dashArray: "6 8" }).addTo(map);
          } else {
            lineRef.current.setLatLngs(pts);
          }
          setDistance(Math.round(map.distance(u, [cookLat, cookLng])));
          map.fitBounds(L.latLngBounds(pts).pad(0.3));
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      lineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookLat, cookLng]);

  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${cookLat},${cookLng}&travelmode=walking`;

  return (
    <div className="pickup-map">
      <div ref={ref} className="map-canvas" />
      <div className="map-footer">
        <span className="map-dist">
          {distance != null
            ? distance < 1000
              ? `📍 ${distance} m to pickup`
              : `📍 ${(distance / 1000).toFixed(1)} km to pickup`
            : "📍 Locating you…"}
        </span>
        <a className="map-dir" href={gmaps} target="_blank" rel="noreferrer">
          Directions ↗
        </a>
      </div>
    </div>
  );
}
