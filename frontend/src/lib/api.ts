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
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  return (text ? JSON.parse(text) : undefined) as T;
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
  upiId: string | null;
  admin: boolean;
  searchRadiusM: number;
  kitchenLat: number | null;
  kitchenLng: number | null;
  kitchenAddress: string | null;
  hasAvatar: boolean;
}

export const RADIUS_OPTIONS = [500, 1000, 1500, 2000, 3000, 5000, 7500, 10000];
export const radiusLabel = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`);

export interface Settlement {
  orderId: string;
  dish: string;
  qty: number;
  cookName: string | null;
  cookUpi: string | null;
  amountPaise: number;
  completedAt: string;
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
  onboard: (name: string, lat: number, lng: number, addressText?: string | null) =>
    call<Me>("/api/v1/me/onboarding", {
      method: "POST",
      body: JSON.stringify({ name, addressText: addressText ?? null, lat, lng }),
    }),
  reverseGeocode: (lat: number, lng: number) =>
    call<{ address: string }>(`/api/public/reverse-geocode?lat=${lat}&lng=${lng}`),
  searchPlaces: (q: string, bias?: { lat: number; lng: number }) =>
    call<{ label: string; lat: number; lng: number }[]>(
      `/api/public/geocode-search?q=${encodeURIComponent(q)}`
        + (bias ? `&lat=${bias.lat}&lng=${bias.lng}` : ""),
    ),
  setRole: (role: Role) =>
    call<Me>("/api/v1/me/role", { method: "POST", body: JSON.stringify({ role }) }),
  setPayout: (upiId: string) =>
    call<Me>("/api/v1/me/payout", { method: "POST", body: JSON.stringify({ upiId }) }),
  setRadius: (radiusMeters: number) =>
    call<Me>("/api/v1/me/radius", { method: "POST", body: JSON.stringify({ radiusMeters }) }),
  setKitchen: (lat: number, lng: number, addressText: string) =>
    call<Me>("/api/v1/me/kitchen", {
      method: "POST",
      body: JSON.stringify({ lat, lng, addressText }),
    }),
  settlements: () =>
    call<{ pending: Settlement[]; totalOwedPaise: number }>("/api/v1/admin/settlements"),
  markPaidOut: (orderId: string) =>
    fetch(`${BASE}/api/v1/admin/settlements/${orderId}/mark-paid-out`, {
      method: "POST",
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).then((r) => {
      if (!r.ok) throw new ApiError(r.status, "Could not mark paid");
    }),

  createListing: (body: ListingBody) =>
    call<Listing>("/api/v1/listings", { method: "POST", body: JSON.stringify(body) }),
  updateListing: (id: string, body: ListingBody) =>
    call<Listing>(`/api/v1/listings/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  myListings: () => call<Listing[]>("/api/v1/listings/mine"),
  setListingStatus: (id: string, status: "open" | "closed") =>
    call<Listing>(`/api/v1/listings/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  nearbyListings: () => call<FeedItem[]>("/api/v1/listings/nearby"),
  getListing: (id: string) => call<DishDetail>(`/api/v1/listings/${id}`),

  // --- Cooks directory & dish requests ---
  cooksNearby: () => call<CookNearby[]>("/api/v1/cooks/nearby"),
  cookProfile: (id: string) => call<CookProfile>(`/api/v1/cooks/${id}`),
  createRequest: (body: { cookId: string; dishName: string; qty: number; note?: string | null; menuItemId?: string | null }) =>
    call<DishRequest>("/api/v1/requests", { method: "POST", body: JSON.stringify(body) }),

  // --- Cook's menu ---
  myMenu: () => call<MenuItem[]>("/api/v1/menu/mine"),
  addMenuItem: (body: MenuItemBody) =>
    call<MenuItem>("/api/v1/menu", { method: "POST", body: JSON.stringify(body) }),
  updateMenuItem: (id: string, body: MenuItemBody) =>
    call<MenuItem>(`/api/v1/menu/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMenuItem: (id: string) =>
    call<void>(`/api/v1/menu/${id}`, { method: "DELETE" }),
  listFromMenu: (menuItemId: string, body: { availableFrom?: string | null; orderBy: string; maxServings: number }) =>
    call<Listing>(`/api/v1/listings/from-menu/${menuItemId}`, { method: "POST", body: JSON.stringify(body) }),
  menuPhotoUrl: (id: string) => `${BASE}/api/public/menu/${id}/photo`,
  uploadMenuPhoto: async (id: string, file: Blob) => {
    const form = new FormData();
    form.append("file", file, "dish.jpg");
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const resp = await fetch(`${BASE}/api/v1/menu/${id}/photo`, { method: "POST", headers, body: form });
    if (!resp.ok) throw new ApiError(resp.status, "Could not upload photo");
    return (await resp.json()) as MenuItem;
  },
  myRequests: () => call<DishRequest[]>("/api/v1/requests/mine"),
  incomingRequests: () => call<DishRequest[]>("/api/v1/requests/incoming"),
  acceptRequest: (id: string, pricePerServing?: number | null) =>
    call<DishRequest>(`/api/v1/requests/${id}/accept`, {
      method: "POST",
      body: JSON.stringify({ pricePerServing: pricePerServing ?? null }),
    }),
  rejectRequest: (id: string) =>
    call<DishRequest>(`/api/v1/requests/${id}/reject`, { method: "POST" }),
  cancelRequest: (id: string) =>
    call<DishRequest>(`/api/v1/requests/${id}/cancel`, { method: "POST" }),
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
  avatarUrl: (id: string) => `${BASE}/api/public/users/${id}/avatar`,
  uploadAvatar: async (file: Blob) => {
    const form = new FormData();
    form.append("file", file, "avatar.jpg");
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const resp = await fetch(`${BASE}/api/v1/me/avatar`, { method: "POST", headers, body: form });
    if (!resp.ok) throw new ApiError(resp.status, "Could not upload the photo");
    return (await resp.json()) as Me;
  },

  // --- Web Push ---
  vapidKey: () => call<{ publicKey: string }>("/api/public/vapid-key"),
  pushSubscribe: (sub: { endpoint: string; p256dh: string; auth: string }) =>
    call<{ ok: boolean }>("/api/v1/me/push/subscribe", {
      method: "POST",
      body: JSON.stringify(sub),
    }),
  pushUnsubscribe: (endpoint: string) =>
    call<{ ok: boolean }>("/api/v1/me/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),

  placeOrder: (listingId: string, qty: number) =>
    call<PlaceResponse>("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({ listingId, qty }),
    }),
  verifyPayment: (
    orderId: string,
    p: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) =>
    call<Order>(`/api/v1/orders/${orderId}/verify-payment`, {
      method: "POST",
      body: JSON.stringify(p),
    }),
  cancelUnpaidOrder: (orderId: string) =>
    fetch(`${BASE}/api/v1/orders/${orderId}/cancel-unpaid`, {
      method: "POST",
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).catch(() => undefined),
  myOrders: () => call<Order[]>("/api/v1/orders/mine"),
  receivedOrders: () => call<Order[]>("/api/v1/orders/received"),
  setOrderStatus: (id: string, status: OrderStatus, pickupCode?: string) =>
    call<Order>(`/api/v1/orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, pickupCode }),
    }),
  // Advance every order of one dish by a step (accepted / preparing / ready).
  bulkOrderStatus: (listingId: string, status: OrderStatus) =>
    call<Order[]>(`/api/v1/orders/listing/${listingId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
};

export type OrderStatus =
  | "pending_payment"
  | "requested"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "rejected"
  | "cancelled";

export interface PlaceResponse {
  order: Order;
  paymentRequired: boolean;
  razorpayOrderId: string | null;
  razorpayKeyId: string | null;
  amountPaise: number | null;
  currency: string | null;
  dish: string | null;
}

export interface Order {
  id: string;
  listingId: string;
  listingTitle: string;
  qty: number;
  status: OrderStatus;
  cookName: string | null;
  consumerName: string | null;
  pickupCode: string | null;
  cookLat: number | null;
  cookLng: number | null;
  createdAt: string;
}

export type FoodType = "veg" | "nonveg";

export interface ListingBody {
  title: string;
  description: string;
  pricePerServing: number;
  maxServings: number;
  foodType: FoodType;
  readyBy?: string | null;
  orderBy?: string | null;
  // Per-dish pickup override; omit to use the cook's saved kitchen location.
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupAddress?: string | null;
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
  availableFrom: string | null;
  status: "open" | "closed";
  foodType: FoodType;
  hasPhoto: boolean;
  expired: boolean;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string | null;
  createdAt: string;
}

export interface DishDetail {
  id: string;
  title: string;
  description: string | null;
  pricePerServing: number;
  remaining: number;
  maxServings: number;
  orderBy: string | null;
  status: "open" | "closed";
  foodType: FoodType;
  hasPhoto: boolean;
  expired: boolean;
  cookName: string | null;
  distanceMeters: number | null;
  pickupAddress: string | null;
}

export interface CookNearby {
  cookId: string;
  cookName: string;
  distanceMeters: number;
  dishCount: number;
  menuCount: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  foodType: FoodType;
  pricePerServing: number | null;
  available: boolean;
  hasPhoto: boolean;
  createdAt: string;
}

export interface CookListingItem {
  id: string;
  title: string;
  description: string | null;
  pricePerServing: number;
  foodType: FoodType;
  hasPhoto: boolean;
  status: "open" | "closed";
  expired: boolean;
  createdAt: string;
}

export interface CookProfile {
  cookId: string;
  cookName: string;
  distanceMeters: number | null;
  menu: MenuItem[];
  dishes: CookListingItem[];
}

export interface MenuItemBody {
  name: string;
  description?: string | null;
  foodType: FoodType;
  pricePerServing?: number | null;
  available?: boolean;
}

export type RequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "fulfilled";

export interface DishRequest {
  id: string;
  dishName: string;
  qty: number;
  note: string | null;
  status: RequestStatus;
  pricePerServing: number | null;
  cookName: string | null;
  consumerName: string | null;
  listingId: string | null;
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
  foodType: FoodType;
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
