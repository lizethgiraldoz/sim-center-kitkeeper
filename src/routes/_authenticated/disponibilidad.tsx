import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeyendaColores, PuntoEstado, type EstadoColorKey } from "@/components/EstadoColor";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { hora, type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/disponibilidad")({
  head: () => ({ meta: [{ title: "Disponibilidad y bloqueos · Laboratorio de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});

const HORAS = Array.from({ length: 12 }, (_, i) => 7 + i); // 07:00–19:00

const ZONAS: [string, string][] = [
  ["PISO_1", "Piso 1"],
  ["PISO_2", "Piso 2"],
  ["PISO_3", "Piso 3"],
  ["CASA_SIMULADA", "Casa Simulada"],
  ["AULAS_MOVILES", "Aulas móviles"],
];

function TableroSalones({ spaces, res }: { spaces: Row[]; res: Row[] }) {
  const [ini, setIni] = useState("07:00");
  const [fin, setFin] = useState("19:00");
  const [ver, setVer] = useState<{ space: Row; r: Row } | null>(null);
  const ocupada = (s: Row) => res.find((r: Row) => r.space_id === s.id && hora(r.starts_at) < fin && hora(r.ends_at) > ini);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tablero de salones por piso</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Franja consultada:</span>
          <Input type="time" className="h-8 w-28" value={ini} onChange={(e) => setIni(e.target.value)} />
          <span>a</span>
          <Input type="time" className="h-8 w-28" value={fin} onChange={(e) => setFin(e.target.value)} />
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-success" /> Disponible</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-destructive" /> Reservado / ocupado (clic para ver detalle)</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {ZONAS.map(([zona, label]) => {
          const ss = spaces.filter((s: Row) => (s.zona ?? "PISO_2") === zona);
          if (!ss.length) return null;
          return (
            <div key={zona}>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">{label}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {ss.map((s: Row) => {
                  const r = ocupada(s);
                  const bloqueado = s.status !== "DISPONIBLE";
                  return (
                    <button key={s.id} type="button" disabled={!r} onClick={() => r && setVer({ space: s, r })}
                      className={`rounded-lg border p-2 text-left text-xs transition ${bloqueado ? "bg-orange/20 border-orange text-foreground" : r ? "bg-destructive text-destructive-foreground border-destructive cursor-pointer" : "bg-success/25 border-success text-foreground cursor-default"}`}>
                      <p className="font-semibold leading-tight">{s.name}</p>
                      <p className="mt-0.5 opacity-80">Aforo: {s.capacity}{bloqueado ? ` · ${s.status.replaceAll("_", " ")}` : r ? ` · Ocupado ${hora(r.starts_at)}–${hora(r.ends_at)}` : " · Disponible"}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Dialog open={!!ver} onOpenChange={(o) => !o && setVer(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{ver?.space.name}</DialogTitle></DialogHeader>
            {ver && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Docente</dt><dd>{ver.r.docente_responsable_nombre ?? ver.r.solicitante_nombre ?? "—"}</dd>
                <dt className="text-muted-foreground">Módulo</dt><dd>{ver.r.activities?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Programa</dt><dd>{ver.r.programa ?? "—"}</dd>
                <dt className="text-muted-foreground">Horario</dt><dd>{hora(ver.r.starts_at)} – {hora(ver.r.ends_at)}</dd>
                <dt className="text-muted-foreground">Estado</dt><dd>{ver.r.status}</dd>
              </dl>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

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
        <LeyendaColores />
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr><th className="sticky left-0 bg-card text-left p-2 border-b min-w-40">Espacio</th>{HORAS.map((h) => <th key={h} className="p-1 border-b font-normal text-muted-foreground">{h}:00</th>)}</tr></thead>
          <tbody>
            {q.data?.spaces.map((s: Row) => (
              <tr key={s.id}>
                <td className="sticky left-0 bg-card p-2 border-b">
                  <div className="font-medium">{s.name}</div>
                  <div className="flex gap-1 mt-0.5"><span className="text-muted-foreground">{s.type === "MOVIL" ? "Móvil" : "Fijo"}</span><PuntoEstado status={s.status as EstadoColorKey} /></div>
                </td>
                {HORAS.map((h) => {
                  const r = celda(s.id, h);
                  const bloqueado = s.status !== "DISPONIBLE";
                  return (
                    <td key={h} className="border-b border-l p-0.5 min-w-14">
                      <div title={bloqueado ? s.status.replaceAll("_", " ") : r ? `Reservado: ${r.activities?.name} · ${hora(r.starts_at)}–${hora(r.ends_at)}${r.status === "SOLICITADA" ? " (pendiente)" : ""}` : "Libre"}
                        className={`h-9 rounded text-[10px] leading-tight p-1 overflow-hidden ${bloqueado ? (s.status === "EN_MANTENIMIENTO" ? "bg-orange text-orange-foreground" : "bg-destructive text-destructive-foreground") : r ? "bg-info text-info-foreground" : "bg-success/25"}`}>
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
                <PuntoEstado status={(d.status !== "DISPONIBLE" ? d.status : d.available > 0 ? "DISPONIBLE" : "RESERVADO") as EstadoColorKey} extra={`${d.available} de ${d.total} disponibles`} />
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
