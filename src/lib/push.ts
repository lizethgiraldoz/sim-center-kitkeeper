import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const env = import.meta.env;
const appId = env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID"] as string | undefined;
const vapidKey = env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY"] as string | undefined;
const apiKey = env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY"] as string | undefined;
const projectId = env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID"] as string | undefined;

export type PushResult =
  | { status: "registered"; token: string }
  | { status: "not-configured" | "unsupported" | "open-in-new-tab" | "denied" };

// Llamar solo desde un manejador de clic: los navegadores ignoran la solicitud de permiso sin gesto del usuario.
export async function enablePush(): Promise<PushResult> {
  const messagingSenderId = appId?.split(":")[1] ?? "";
  if (!apiKey || !projectId || !appId || !vapidKey || !messagingSenderId) {
    return { status: "not-configured" };
  }
  if (!("Notification" in window) || !(await isSupported())) {
    return { status: "unsupported" };
  }
  if (window.top !== window.self) {
    return { status: "open-in-new-tab" };
  }

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    return { status: "denied" };
  }

  const firebaseConfig = { apiKey, projectId, appId, messagingSenderId };
  const query = new URLSearchParams(firebaseConfig).toString();
  const serviceWorkerRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
  const messaging = getMessaging(initializeApp(firebaseConfig));
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  return token ? { status: "registered", token } : { status: "denied" };
}
