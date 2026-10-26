import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EstadoBadge } from "@/components/EstadoBadge";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { hora, type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/disponibilidad")({
  head: () => ({ meta: [{ title: "Disponibilidad y bloqueos · Centro de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});

const HORAS = Array.from({ length: 12 }, (_, i) => 7 + i); // 07:00–19:00

function Page() {
  const [dia, setDia] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }));
  const desde = new Date(`${dia}T00:00:00-05:00`).toISOString();
  const hasta = new Date(`${dia}T23:59:59-05:00`).toISOString();
  const q = useQuery({
    queryKey: ["disponibilidad", dia],
    queryFn: async () => {
      const [sp, rs, disp] = await Promise.all([
        supabase.from("spaces").select("*").order("name"),
        supabase.from("reservations").select("id, space_id, starts_at, ends_at, status, activities(name)").in("status", ["SOLICITADA", "APROBADA", "EN_CURSO"]).lt("starts_at", hasta).gt("ends_at", desde),
        supabase.rpc("disponibilidad", { _starts_at: new Date(`${dia}T07:00:00-05:00`).toISOString(), _ends_at: new Date(`${dia}T19:00:00-05:00`).toISOString() }),
      ]);
      return { spaces: sp.data ?? [], res: rs.data ?? [], disp: (disp.data ?? []).filter((d: Row) => d.kind !== "ESPACIO") };
    },
  });
  const celda = (spaceId: string, h: number) => {
    const ini = new Date(`${dia}T${String(h).padStart(2, "0")}:00:00-05:00`).getTime();
    const fin = ini + 3600000;
    return q.data?.res.find((r: Row) => r.space_id === spaceId && new Date(r.starts_at).getTime() < fin && new Date(r.ends_at).getTime() > ini);
  };

  return (
    <div className="space-y-6">
      <Titulo t="Tablero de disponibilidad y bloqueos" d="Espacios fijos y aulas móviles por franja horaria" />
      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" className="w-44" value={dia} onChange={(e) => setDia(e.target.value)} />
        <div className="flex flex-wrap gap-2 text-xs items-center">
          <span className="inline-block h-3 w-3 rounded bg-success" /> Aprobada
          <span className="inline-block h-3 w-3 rounded bg-warning ml-2" /> Solicitada
          <span className="inline-block h-3 w-3 rounded border ml-2" /> Libre
        </div>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr><th className="sticky left-0 bg-card text-left p-2 border-b min-w-40">Espacio</th>{HORAS.map((h) => <th key={h} className="p-1 border-b font-normal text-muted-foreground">{h}:00</th>)}</tr></thead>
          <tbody>
            {q.data?.spaces.map((s: Row) => (
              <tr key={s.id}>
                <td className="sticky left-0 bg-card p-2 border-b">
                  <div className="font-medium">{s.name}</div>
                  <div className="flex gap-1 mt-0.5"><span className="text-muted-foreground">{s.type === "MOVIL" ? "Móvil" : "Fijo"}</span>{s.status !== "DISPONIBLE" && <EstadoBadge status={s.status} />}</div>
                </td>
                {HORAS.map((h) => {
                  const r = celda(s.id, h);
                  const bloqueado = s.status !== "DISPONIBLE";
                  return (
                    <td key={h} className="border-b border-l p-0.5 min-w-14">
                      <div title={r ? `${r.activities?.name} · ${hora(r.starts_at)}–${hora(r.ends_at)}` : ""}
                        className={`h-9 rounded text-[10px] leading-tight p-1 overflow-hidden ${r ? (r.status === "SOLICITADA" ? "bg-warning text-warning-foreground" : "bg-success text-success-foreground") : bloqueado ? "bg-muted" : ""}`}>
                        {r?.activities?.name}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Equipos, simuladores e insumos (07:00–19:00)</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {q.data?.disp.map((d: Row) => (
            <div key={d.id} className="border rounded-md p-2 text-sm flex justify-between gap-2">
              <span className="min-w-0 truncate" title={d.name}>{d.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{d.available}/{d.total}</span>
                <EstadoBadge status={d.status !== "DISPONIBLE" ? d.status : d.available > 0 ? "DISPONIBLE" : "RESERVADO"} />
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
