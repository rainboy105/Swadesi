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

export interface Me {
  id: string;
  phone: string;
  name: string | null;
  addressText: string | null;
  lat: number | null;
  lng: number | null;
  onboarded: boolean;
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
};

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
