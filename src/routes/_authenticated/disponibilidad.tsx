import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeyendaColores, PuntoEstado, type EstadoColorKey } from "@/components/EstadoColor";
import { RelojHora } from "@/components/RelojHora";
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
function parseMinutos(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
}
function calcularPicoAforo(reservas: Row[], toMinDia: (iso: string) => number, winIni: number, winFin: number): number {
  const eventos: { t: number; delta: number }[] = [];
  for (const r of reservas) {
    const cs = Math.max(toMinDia(r.starts_at), winIni);
    const ce = Math.min(toMinDia(r.ends_at), winFin);
    const p = Math.max(1, Number(r.participants ?? 0));
    if (cs < ce) {
      eventos.push({ t: cs, delta: p });
      eventos.push({ t: ce, delta: -p });
    }
  }
  eventos.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.delta - b.delta));
  let actual = 0;
  let pico = 0;
  for (const ev of eventos) {
    actual += ev.delta;
    if (actual > pico) pico = actual;
  }
  return pico;
}
function TableroSalones({ dia, spaces, res }: { dia: string; spaces: Row[]; res: Row[] }) {
  const [ini, setIni] = useState("07:00");
  const [fin, setFin] = useState("19:00");
  const [ver, setVer] = useState<{ space: Row; reservas: Row[]; ocupados: number } | null>(null);
  const diaInicio = new Date(`${dia}T00:00:00-05:00`).getTime();
  const toMinDia = (isoStr: string) =>
    Math.max(0, Math.min(24 * 60, Math.round((new Date(isoStr).getTime() - diaInicio) / 60000)));
  const winIni = parseMinutos(ini);
  const winFin = parseMinutos(fin);
  const reservasEnFranja = (s: Row) =>
    res.filter((r: Row) => r.space_id === s.id && toMinDia(r.starts_at) < winFin && toMinDia(r.ends_at) > winIni);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tablero de salones por piso</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Franja consultada:</span>
          <div className="w-28">
            <RelojHora value={ini} onChange={setIni} className="h-8 text-xs px-2.5" />
          </div>
          <span>a</span>
          <div className="w-28">
            <RelojHora value={fin} onChange={setFin} className="h-8 text-xs px-2.5" />
          </div>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-success" /> Disponible
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-amber-500" /> Ocupación parcial (con cupos)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-destructive" /> Aforo completo o casi lleno (clic para detalle)
          </span>
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
                  const bloqueado = s.status !== "DISPONIBLE";
                  const reservasEspacio = reservasEnFranja(s);
                  const cap = Number(s.capacity ?? 0);
                  const ocupados = calcularPicoAforo(reservasEspacio, toMinDia, winIni, winFin);
                  const disponibles = Math.max(0, cap - ocupados);
                  const tieneReservas = reservasEspacio.length > 0 && ocupados > 0;
                  const llenoOCasi =
                    tieneReservas &&
                    (cap <= 0 || ocupados >= cap || ocupados / cap >= 0.85 || (cap > 1 && disponibles <= 1));
                  const cardClass = bloqueado
                    ? "bg-orange/20 border-orange text-foreground cursor-default"
                    : llenoOCasi
                      ? "bg-destructive text-destructive-foreground border-destructive cursor-pointer"
                      : tieneReservas
                        ? "bg-amber-500/20 border-amber-500 text-foreground cursor-pointer hover:bg-amber-500/30"
                        : "bg-success/25 border-success text-foreground cursor-default";
                  let estadoTexto = `Aforo: 0 de ${cap} · Disponible`;
                  if (bloqueado) {
                    estadoTexto = `Aforo: ${cap} · ${s.status.replaceAll("_", " ")}`;
                  } else if (llenoOCasi) {
                    const etiqueta = ocupados >= cap ? "Lleno" : "Casi lleno";
                    estadoTexto = `Aforo actual: ${ocupados} de ${cap} · ${etiqueta}`;
                  } else if (tieneReservas) {
                    estadoTexto = `Aforo actual: ${ocupados} de ${cap} · ${disponibles} disp.`;
                  }
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!tieneReservas}
                      onClick={() => tieneReservas && setVer({ space: s, reservas: reservasEspacio, ocupados })}
                      className={`rounded-lg border p-2 text-left text-xs transition ${cardClass}`}
                    >
                      <p className="font-semibold leading-tight">{s.name}</p>
                      <p className="mt-0.5 opacity-90">{estadoTexto}</p>
                      {!bloqueado && tieneReservas && (
                        <p className="mt-0.5 text-[11px] opacity-80 truncate">
                          {reservasEspacio.length === 1
                            ? `${hora(reservasEspacio[0].starts_at)}–${hora(reservasEspacio[0].ends_at)}`
                            : `${reservasEspacio.length} reservas en franja`}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Dialog open={!!ver} onOpenChange={(o) => !o && setVer(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {ver?.space.name} · Aforo {ver?.ocupados} de {ver?.space.capacity}
              </DialogTitle>
            </DialogHeader>
            {ver && (
              <div className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Cupos disponibles en franja: <strong>{Math.max(0, Number(ver.space.capacity ?? 0) - ver.ocupados)}</strong> de{" "}
                  {ver.space.capacity}
                </p>
                <div className="space-y-2 max-h-72 overflow-auto">
                  {ver.reservas.map((r: Row) => (
                    <dl key={r.id} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border p-2.5 text-xs">
                      <dt className="text-muted-foreground">Docente</dt>
                      <dd className="font-medium">{r.docente_responsable_nombre ?? r.solicitante_nombre ?? "—"}</dd>
                      <dt className="text-muted-foreground">Módulo</dt>
                      <dd>{r.activities?.name ?? "—"}</dd>
                      <dt className="text-muted-foreground">Programa</dt>
                      <dd>{r.programa ?? "—"}</dd>
                      <dt className="text-muted-foreground">Horario</dt>
                      <dd>
                        {hora(r.starts_at)} – {hora(r.ends_at)}
                      </dd>
                      <dt className="text-muted-foreground">Participantes</dt>
                      <dd className="font-semibold">
                        {r.participants ?? 0} de {ver.space.capacity}
                      </dd>
                      <dt className="text-muted-foreground">Estado</dt>
                      <dd>{r.status}</dd>
                    </dl>
                  ))}
                </div>
              </div>
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
        supabase
          .from("reservations")
          .select("id, space_id, starts_at, ends_at, status, programa, participants, docente_responsable_nombre, solicitante_nombre, activities(name)")
          .in("status", ["SOLICITADA", "APROBADA", "EN_CURSO"])
          .lt("starts_at", hasta)
          .gt("ends_at", desde),
        supabase.rpc("disponibilidad", {
          _starts_at: new Date(`${dia}T07:00:00-05:00`).toISOString(),
          _ends_at: new Date(`${dia}T19:00:00-05:00`).toISOString(),
        }),
      ]);
      return { spaces: sp.data ?? [], res: rs.data ?? [], disp: (disp.data ?? []).filter((d: Row) => d.kind !== "ESPACIO") };
    },
  });
  const celda = (spaceId: string, h: number) => {
    const ini = new Date(`${dia}T${String(h).padStart(2, "0")}:00:00-05:00`).getTime();
    const fin = ini + 3600000;
    return q.data?.res.filter(
      (r: Row) => r.space_id === spaceId && new Date(r.starts_at).getTime() < fin && new Date(r.ends_at).getTime() > ini
    ) ?? [];
  };
  return (
    <div className="space-y-6">
      <Titulo t="Tablero de disponibilidad y bloqueos" d="Espacios fijos y aulas móviles por franja horaria" />
      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" className="w-44" value={dia} onChange={(e) => setDia(e.target.value)} />
        <LeyendaColores />
      </div>
      {q.data && <TableroSalones dia={dia} spaces={q.data.spaces} res={q.data.res.filter((r: Row) => ["APROBADA", "EN_CURSO"].includes(r.status))} />}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card text-left p-2 border-b min-w-40">Espacio</th>
                {HORAS.map((h) => (
                  <th key={h} className="p-1 border-b font-normal text-muted-foreground">
                    {h}:00
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data?.spaces.map((s: Row) => (
                <tr key={s.id}>
                  <td className="sticky left-0 bg-card p-2 border-b">
                    <div className="font-medium">{s.name}</div>
                    <div className="flex gap-1 mt-0.5">
                      <span className="text-muted-foreground">
                        {s.type === "MOVIL" ? "Móvil" : "Fijo"} · Aforo {s.capacity}
                      </span>
                      <PuntoEstado status={s.status as EstadoColorKey} />
                    </div>
                  </td>
                  {HORAS.map((h) => {
                    const rsCelda = celda(s.id, h);
                    const r = rsCelda[0];
                    const totalPart = rsCelda.reduce((acc: number, x: Row) => acc + Number(x.participants ?? 0), 0);
                    const bloqueado = s.status !== "DISPONIBLE";
                    return (
                      <td key={h} className="border-b border-l p-0.5 min-w-14">
                        <div
                          title={
                            bloqueado
                              ? s.status.replaceAll("_", " ")
                              : r
                                ? `Reservado: ${rsCelda.map((x: Row) => x.activities?.name).join(" / ")} · Aforo: ${totalPart}/${s.capacity} · ${hora(r.starts_at)}–${hora(r.ends_at)}${r.status === "SOLICITADA" ? " (pendiente)" : ""}`
                                : `Libre (0/${s.capacity})`
                          }
                          className={`h-9 rounded text-[10px] leading-tight p-1 overflow-hidden ${
                            bloqueado
                              ? s.status === "EN_MANTENIMIENTO"
                                ? "bg-orange text-orange-foreground"
                                : "bg-destructive text-destructive-foreground"
                              : r
                                ? "bg-info text-info-foreground"
                                : "bg-success/25"
                          }`}
                        >
                          {r ? `${r.activities?.name ?? ""} (${totalPart}/${s.capacity})` : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Equipos, simuladores e insumos (07:00–19:00)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {q.data?.disp.map((d: Row) => (
            <div key={d.id} className="border rounded-md p-2 text-sm flex justify-between gap-2">
              <span className="min-w-0 truncate" title={d.name}>
                {d.name}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {d.available}/{d.total}
                </span>
                <PuntoEstado
                  status={(d.status !== "DISPONIBLE" ? d.status : d.available > 0 ? "DISPONIBLE" : "RESERVADO") as EstadoColorKey}
                  extra={`${d.available} de ${d.total} disponibles`}
                />
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}