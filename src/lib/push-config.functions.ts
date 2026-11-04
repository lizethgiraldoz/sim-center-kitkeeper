import { createServerFn } from "@tanstack/react-start";

// Configuración pública de la app web de Firebase (estas claves web son públicas por diseño).
export const getPushConfig = createServerFn({ method: "GET" }).handler(async () => {
  const apiKey = (process.env["GOOGLE_API_KEY"] ?? "").trim();
  const vapidKey = (process.env["FIREBASE_VAPID_KEY"] ?? "").trim();
  return {
    apiKey,
    vapidKey,
    projectId: "laboratorio-simulacion-udea",
    appId: "1:371023118269:web:74f9534af9852450521cd4",
    messagingSenderId: "371023118269",
  };
});
