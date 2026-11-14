// Thin API client. VITE_API_URL points at the backend (prod: https://api.swaadesi.org).
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

const TOKEN_KEY = "swadesi.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: session only */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!resp.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await resp.json();
      if (body?.message) message = body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(resp.status, message);
  }
  return (await resp.json()) as T;
}

export interface LoginResponse {
  token: string;
  userId: string;
  name: string | null;
  onboarded: boolean;
  newUser: boolean;
}

export type Role = "cook" | "consumer";

export interface Me {
  id: string;
  phone: string;
  name: string | null;
  addressText: string | null;
  lat: number | null;
  lng: number | null;
  onboarded: boolean;
  activeRole: Role;
}

export const api = {
  requestOtp: (phone: string) =>
    call<{ sent: boolean }>("/api/v1/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  verifyOtp: (phone: string, code: string) =>
    call<LoginResponse>("/api/v1/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    }),
  me: () => call<Me>("/api/v1/me"),
  onboard: (name: string, addressText: string, lat: number, lng: number) =>
    call<Me>("/api/v1/me/onboarding", {
      method: "POST",
      body: JSON.stringify({ name, addressText, lat, lng }),
    }),
  reverseGeocode: (lat: number, lng: number) =>
    call<{ address: string }>(`/api/public/reverse-geocode?lat=${lat}&lng=${lng}`),
  setRole: (role: Role) =>
    call<Me>("/api/v1/me/role", { method: "POST", body: JSON.stringify({ role }) }),

  createListing: (body: {
    title: string;
    description: string;
    pricePerServing: number;
    maxServings: number;
    readyBy?: string | null;
    orderBy?: string | null;
  }) => call<Listing>("/api/v1/listings", { method: "POST", body: JSON.stringify(body) }),
  updateListing: (
    id: string,
    body: {
      title: string;
      description: string;
      pricePerServing: number;
      maxServings: number;
      readyBy?: string | null;
      orderBy?: string | null;
    },
  ) => call<Listing>(`/api/v1/listings/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  myListings: () => call<Listing[]>("/api/v1/listings/mine"),
  setListingStatus: (id: string, status: "open" | "closed") =>
    call<Listing>(`/api/v1/listings/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  nearbyListings: () => call<FeedItem[]>("/api/v1/listings/nearby"),
  uploadListingPhoto: async (id: string, file: Blob) => {
    const form = new FormData();
    form.append("file", file, "dish.jpg");
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const resp = await fetch(`${BASE}/api/v1/listings/${id}/photo`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!resp.ok) throw new ApiError(resp.status, "Could not upload the photo");
    return (await resp.json()) as Listing;
  },
  listingPhotoUrl: (id: string) => `${BASE}/api/public/listings/${id}/photo`,

  placeOrder: (listingId: string, qty: number) =>
    call<Order>("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ listingId, qty }),
    }),
  myOrders: () => call<Order[]>("/api/v1/orders/mine"),
  receivedOrders: () => call<Order[]>("/api/v1/orders/received"),
  setOrderStatus: (id: string, status: OrderStatus, pickupCode?: string) =>
    call<Order>(`/api/v1/orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, pickupCode }),
    }),
};

export type OrderStatus =
  | "requested"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "rejected"
  | "cancelled";

export interface Order {
  id: string;
  listingId: string;
  listingTitle: string;
  qty: number;
  status: OrderStatus;
  cookName: string | null;
  consumerName: string | null;
  pickupCode: string | null;
  createdAt: string;
}

export interface Listing {
  id: string;
  title: string;
  description: string | null;
  pricePerServing: number;
  maxServings: number;
  remaining: number;
  readyBy: string | null;
  orderBy: string | null;
  status: "open" | "closed";
  hasPhoto: boolean;
  expired: boolean;
  createdAt: string;
}

export interface FeedItem {
  id: string;
  title: string;
  description: string | null;
  pricePerServing: number;
  remaining: number;
  readyBy: string | null;
  orderBy: string | null;
  cookName: string | null;
  distanceMeters: number;
  hasPhoto: boolean;
}

/** India-first phone normalization for display; the server does the authoritative one. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.length >= 9 ? digits : null;
  const bare = digits.replace(/^0+/, "");
  if (bare.length === 10 && /^[6-9]/.test(bare)) return `+91${bare}`;
  if (bare.length === 12 && bare.startsWith("91")) return `+${bare}`;
  return null;
}
