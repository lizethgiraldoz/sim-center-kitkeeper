import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { getPushConfig } from "@/lib/push-config.functions";

export type PushResult =
  | { status: "registered"; token: string }
  | { status: "not-configured" | "unsupported" | "open-in-new-tab" | "denied" };

let messagingRef: Messaging | null = null;

async function registrar(): Promise<PushResult> {
  const { vapidKey, ...firebaseConfig } = await getPushConfig();
  if (!firebaseConfig.apiKey || !vapidKey) return { status: "not-configured" };
  const query = new URLSearchParams(firebaseConfig).toString();
  const serviceWorkerRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
  await navigator.serviceWorker.ready;
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  messagingRef = getMessaging(app);
  const token = await getToken(messagingRef, { vapidKey, serviceWorkerRegistration });
  return token ? { status: "registered", token } : { status: "denied" };
}

async function entornoValido(): Promise<PushResult | null> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported())) return { status: "unsupported" };
  if (window.top !== window.self) return { status: "open-in-new-tab" };
  return null;
}

// Llamar solo desde un manejador de clic: los navegadores ignoran la solicitud de permiso sin gesto del usuario.
export async function enablePush(): Promise<PushResult> {
  const bad = await entornoValido();
  if (bad) return bad;
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { status: "denied" };
  return registrar();
}

// Al abrir la app: si el permiso ya fue concedido, renueva el registro del dispositivo sin pedir nada.
export async function refreshPushSilently(): Promise<PushResult | null> {
  const bad = await entornoValido();
  if (bad || Notification.permission !== "granted") return null;
  try { return await registrar(); } catch { return null; }
}

// Con la pestaña abierta y visible, el navegador no muestra el aviso: lo mostramos nosotros.
export function listenForeground(cb: (title: string, body: string) => void): () => void {
  if (!messagingRef) return () => {};
  return onMessage(messagingRef, (p) => {
    const title = p.notification?.title ?? "Laboratorio de Simulación";
    const body = p.notification?.body ?? "";
    cb(title, body);
    try {
      if (Notification.permission === "granted" && document.visibilityState !== "visible") new Notification(title, { body, icon: "/favicon.png" });
    } catch { /* algunos navegadores móviles no permiten new Notification */ }
  });
}
