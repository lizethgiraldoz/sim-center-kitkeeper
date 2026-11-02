import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

type NotifyInput = { reservationId: string; title: string; body: string };

// Envía una notificación push a la otra parte de la reserva:
// si escribe el docente, avisa a los administradores; si escribe un admin, avisa al docente.
export const notifyReservationPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotifyInput) => {
    if (!input?.reservationId || !input?.title || !input?.body) throw new Error("Datos incompletos");
    return { reservationId: String(input.reservationId), title: String(input.title).slice(0, 120), body: String(input.body).slice(0, 300) };
  })
  .handler(async ({ data, context }) => {
    // RLS como el usuario: solo ve la reserva si es docente dueño o administrador.
    const { data: r } = await context.supabase
      .from("reservations")
      .select("id, teacher_id")
      .eq("id", data.reservationId)
      .maybeSingle();
    if (!r) throw new Error("Reserva no encontrada");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let recipientIds: string[] = [];
    if (r.teacher_id !== context.userId) {
      recipientIds = [r.teacher_id];
    } else {
      const { data: admins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "ADMINISTRADOR_REVISOR");
      recipientIds = (admins ?? []).map((a) => a.user_id).filter((id) => id !== context.userId);
    }
    if (!recipientIds.length) return { sent: 0 };

    const { data: tokens } = await supabaseAdmin
      .from("push_tokens")
      .select("token")
      .in("user_id", recipientIds);
    const list = (tokens ?? []).map((t) => t.token);
    if (!list.length) return { sent: 0 };

    const apiKey = process.env["LOVABLE_API_KEY"];
    const connectionApiKey = process.env["FIREBASE_MESSAGING_API_KEY"];
    if (!apiKey || !connectionApiKey) return { sent: 0 };

    let sent = 0;
    const stale: string[] = [];
    for (const token of list) {
      const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Connection-Api-Key": connectionApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: data.title, body: data.body },
            data: { path: "/mis-solicitudes" },
          },
        }),
      });
      if (res.ok) { sent++; continue; }
      const text = await res.text();
      console.error(`FCM send failed [${res.status}]: ${text}`);
      if (res.status === 404 || (res.status === 400 && text.includes("INVALID_ARGUMENT"))) stale.push(token);
    }
    if (stale.length) await supabaseAdmin.from("push_tokens").delete().in("token", stale);
    return { sent };
  });
