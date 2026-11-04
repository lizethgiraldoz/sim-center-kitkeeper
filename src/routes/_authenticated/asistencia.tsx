import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { Seguimiento } from "@/components/Seguimiento";
import { RESERVA_SELECT, fmt, hora, type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/asistencia")({
  head: () => ({ meta: [{ title: "Asistencia y montaje · Laboratorio de Simulación UdeA" }, { name: "description", content: "Registro de asistencia de docentes, avance del montaje y faltas." }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});

function Page() {
  const [tab, setTab] = useState("REGISTRO");
  const q = useQuery({
    queryKey: ["reservas", "asistencia"],
    queryFn: async () => (await supabase.from("reservations").select(RESERVA_SELECT).or("status.eq.APROBADA,status.eq.EN_CURSO,asistencia.not.is.null,estado_montaje.eq.FALTA_EQUIPO").order("starts_at")).data ?? [],
  });
  const all = (q.data ?? []) as Row[];
  const registro = all.filter((r) => ["APROBADA", "EN_CURSO"].includes(r.status));
  const faltas = all.filter((r) => r.asistencia === "NO_ASISTIO" || r.estado_montaje === "FALTA_EQUIPO").sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  return (
    <div>
      <Titulo t="Asistencia y montaje" d="Registra la asistencia de los docentes y el avance del montaje de cada práctica aprobada" />
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList><TabsTrigger value="REGISTRO">Registro ({registro.length})</TabsTrigger><TabsTrigger value="FALTAS">Faltas e inasistencias ({faltas.length})</TabsTrigger></TabsList>
      </Tabs>
      <div className="space-y-3">
        {tab === "REGISTRO" && (registro.length === 0 ? <p className="text-sm text-muted-foreground">No hay prácticas aprobadas pendientes.</p> :
          registro.map((r) => (
            <Card key={r.id}><CardContent className="p-4">
              <strong>{r.activities?.name}</strong>
              <p className="text-sm text-muted-foreground">{r.spaces?.name ?? "Sin espacio"} · {fmt(r.starts_at)} – {hora(r.ends_at)} · {r.docente_responsable_nombre ?? r.solicitante_nombre ?? "—"}</p>
              <Seguimiento r={r} onChanged={() => q.refetch()} />
            </CardContent></Card>
          )))}
        {tab === "FALTAS" && (faltas.length === 0 ? <p className="text-sm text-muted-foreground">No hay faltas ni inasistencias registradas.</p> :
          faltas.map((r) => (
            <Card key={r.id}><CardContent className="p-4 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                {r.asistencia === "NO_ASISTIO" && <span className="rounded bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">Inasistencia del docente</span>}
                {r.estado_montaje === "FALTA_EQUIPO" && <span className="rounded bg-warning px-2 py-0.5 text-xs font-semibold text-warning-foreground">Falta de equipo</span>}
                <strong>{r.activities?.name}</strong>
              </div>
              <p className="text-muted-foreground">{fmt(r.starts_at)} · {r.spaces?.name ?? "—"} · {r.docente_responsable_nombre ?? r.solicitante_nombre ?? "—"} · {r.programa}</p>
              {r.falta_equipo && <p className="text-xs mt-1"><strong>Equipo faltante:</strong> {r.falta_equipo}</p>}
            </CardContent></Card>
          )))}
      </div>
    </div>
  );
}
