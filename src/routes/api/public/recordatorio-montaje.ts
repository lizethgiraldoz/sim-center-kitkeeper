import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

// Ejecutado cada hora: avisa a administradores (y al docente) de reservas aprobadas
// que empiezan en la próxima 1–2 horas y cuyo montaje aún no está LISTO.
export const Route = createFileRoute("/api/public/recordatorio-montaje")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = Date.now();
        const desde = new Date(now + 60 * 60_000).toISOString();
        const hasta = new Date(now + 120 * 60_000).toISOString();
        const { data: reservas, error } = await supabaseAdmin
          .from("reservations")
          .select("id, teacher_id, starts_at, estado_montaje, activities(name), spaces(name)")
          .eq("status", "APROBADA")
          .neq("estado_montaje", "LISTO")
          .gte("starts_at", desde)
          .lt("starts_at", hasta);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!reservas?.length) return Response.json({ sent: 0 });

        const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "ADMINISTRADOR_REVISOR");
        const adminIds = (admins ?? []).map((a) => a.user_id);
        const apiKey = process.env["LOVABLE_API_KEY"];
        const conn = process.env["FIREBASE_MESSAGING_API_KEY"];
        if (!apiKey || !conn) return Response.json({ sent: 0, reason: "push not configured" });

        let sent = 0;
        for (const r of reservas) {
          const ids = [...adminIds, r.teacher_id];
          const { data: tokens } = await supabaseAdmin.from("push_tokens").select("token").in("user_id", ids);
          const hora = new Date(r.starts_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
          const act = (r.activities as { name?: string } | null)?.name ?? "Reserva";
          const esp = (r.spaces as { name?: string } | null)?.name ?? "";
          for (const t of tokens ?? []) {
            const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": conn, "Content-Type": "application/json" },
              body: JSON.stringify({ message: { token: t.token, notification: { title: "Montaje pendiente", body: `${act} ${esp ? `en ${esp} ` : ""}inicia a las ${hora} y el montaje aún no está listo.` }, data: { path: "/asistencia" } } }),
            });
            if (res.ok) sent++;
            else {
              const text = await res.text();
              console.error(`FCM send failed [${res.status}]: ${text}`);
              if (res.status === 404 || res.status === 400) await supabaseAdmin.from("push_tokens").delete().eq("token", t.token);
            }
          }
        }
        return Response.json({ sent });
      },
    },
  },
});
