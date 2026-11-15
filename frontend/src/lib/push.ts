// Web Push enable/disable for the consumer. Registers the service worker, asks permission,
// subscribes with the backend's VAPID key, and stores the subscription server-side.
import { api } from "./api";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

/** Turn notifications ON. Returns true on success. Throws with a friendly message otherwise. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) throw new Error("Notifications aren't supported on this browser.");
  const { publicKey } = await api.vapidKey();
  if (!publicKey) throw new Error("Notifications aren't set up yet. Please try again later.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications are blocked. Allow them in your browser settings to turn them on.");
  }

  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  await api.pushSubscribe({
    endpoint: sub.endpoint,
    p256dh: keyToBase64Url(sub.getKey("p256dh")),
    auth: keyToBase64Url(sub.getKey("auth")),
  });
  return true;
}

/** Turn notifications OFF for this browser. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    try {
      await api.pushUnsubscribe(sub.endpoint);
    } catch {
      /* ignore */
    }
    await sub.unsubscribe();
  }
}

/** True if this browser currently has an active push subscription. */
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}
