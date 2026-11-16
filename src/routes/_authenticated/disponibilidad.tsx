import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarCheck2, ChevronDown, ChevronRight, DoorOpen, Percent, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LeyendaColores } from "@/components/EstadoColor";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { hora, type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/disponibilidad")({
  head: () => ({ meta: [{ title: "Disponibilidad · Laboratorio de Simulación UdeA" }] }),
  component: () => (
    <SoloAdmin>
      <Page />
    </SoloAdmin>
  ),
});

const H0 = 6; // 06:00
const H1 = 19; // 19:00
const TOTAL_HORAS = H1 - H0; // 13 horas
const HORAS = Array.from({ length: TOTAL_HORAS }, (_, i) => H0 + i); // 06:00 .. 18:00 (cierra 19:00)

const ZONAS: [string, string][] = [
  ["PISO_1", "Piso 1"],
  ["PISO_2", "Piso 2"],
  ["PISO_3", "Piso 3"],
  ["CASA_SIMULADA", "Casa Simulada"],
  ["AULAS_MOVILES", "Aulas móviles"],
];

function hoyBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function minutosBogota(iso: string): number {
  const [h = 0, m = 0] = new Date(iso)
    .toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })
    .split(":")
    .map(Number);
  return h * 60 + m;
}

function asignarCarriles(reservas: Row[]): Array<{ r: Row; lane: number; lanes: number }> {
  const ordenadas = [...reservas].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  );
  const finPorCarril: number[] = [];
  const asignadas: Array<{ r: Row; lane: number }> = [];

  for (const r of ordenadas) {
    const ini = minutosBogota(r.starts_at);
    const fin = minutosBogota(r.ends_at);
    let lane = finPorCarril.findIndex((f) => f <= ini);
    if (lane === -1) {
      lane = finPorCarril.length;
      finPorCarril.push(fin);
    } else {
      finPorCarril[lane] = fin;
    }
    asignadas.push({ r, lane });
  }

  const totalLanes = Math.max(1, finPorCarril.length);
  return asignadas.map((item) => ({ ...item, lanes: totalLanes }));
}

function Page() {
  const [dia, setDia] = useState<string>(hoyBogota);
  const [zonaFiltro, setZonaFiltro] = useState<string>("TODAS");
  const [aforoMinStr, setAforoMinStr] = useState<string>("");
  const [zonasAbiertas, setZonasAbiertas] = useState<Record<string, boolean>>({
    PISO_1: true,
    PISO_2: true,
    PISO_3: true,
    CASA_SIMULADA: true,
    AULAS_MOVILES: true,
  });
  const [detalle, setDetalle] = useState<{ reserva: Row; space: Row } | null>(null);

  const desde = new Date(`${dia}T00:00:00-05:00`).toISOString();
  const hasta = new Date(`${dia}T23:59:59-05:00`).toISOString();

  const q = useQuery({
    queryKey: ["disponibilidad", dia],
    queryFn: async () => {
      const [sp, rs] = await Promise.all([
        supabase.from("spaces").select("*").order("name"),
        supabase
          .from("reservations")
          .select(
            "id, space_id, starts_at, ends_at, status, programa, semestre, participants, docente_responsable_nombre, solicitante_nombre, activities(name)"
          )
          .in("status", ["APROBADA", "EN_CURSO"])
          .lt("starts_at", hasta)
          .gt("ends_at", desde),
      ]);
      return {
        spaces: sp.data ?? [],
        res: rs.data ?? [],
      };
    },
  });

  const aforoMin = Math.max(0, Number.parseInt(aforoMinStr, 10) || 0);

  const espaciosFiltrados = useMemo(() => {
    const base = q.data?.spaces ?? [];
    return base.filter((s: Row) => {
      const z = s.zona ?? "PISO_2";
      if (zonaFiltro !== "TODAS" && z !== zonaFiltro) return false;
      if (aforoMin > 0 && Number(s.capacity ?? 0) < aforoMin) return false;
      return true;
    });
  }, [q.data?.spaces, zonaFiltro, aforoMin]);

  const reservasPorEspacio = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of q.data?.res ?? []) {
      if (!r.space_id) continue;
      const list = map.get(r.space_id) ?? [];
      list.push(r);
      map.set(r.space_id, list);
    }
    return map;
  }, [q.data?.res]);

  const kpis = useMemo(() => {
    const spaces = espaciosFiltrados;
    const idsVisibles = new Set(spaces.map((s: Row) => s.id));
    const reservasVisibles = (q.data?.res ?? []).filter((r: Row) => r.space_id && idsVisibles.has(r.space_id));

    const ahora = new Date();
    const esHoy = dia === hoyBogota();
    const minAhora = esHoy
      ? minutosBogota(ahora.toISOString())
      : Math.min(H1 * 60 - 1, Math.max(H0 * 60, minutosBogota(ahora.toISOString())));

    let disponiblesAhora = 0;
    let minutosOcupadosTotales = 0;
    const minDiaIni = H0 * 60;
    const minDiaFin = H1 * 60;

    for (const s of spaces) {
      const rs = reservasPorEspacio.get(s.id) ?? [];
      const ocupadoAhora = rs.some((r: Row) => {
        const ini = minutosBogota(r.starts_at);
        const fin = minutosBogota(r.ends_at);
        return minAhora >= ini && minAhora < fin;
      });
      if (!ocupadoAhora) disponiblesAhora += 1;

      // Calcular minutos únicos ocupados dentro de 06:00–19:00
      const intervalos = rs
        .map((r: Row) => [
          Math.max(minDiaIni, minutosBogota(r.starts_at)),
          Math.min(minDiaFin, minutosBogota(r.ends_at)),
        ])
        .filter(([a, b]) => b > a)
        .sort((a, b) => a[0] - b[0]);

      let curIni = -1;
      let curFin = -1;
      for (const [a, b] of intervalos) {
        if (a > curFin) {
          if (curFin > curIni) minutosOcupadosTotales += curFin - curIni;
          curIni = a;
          curFin = b;
        } else {
          curFin = Math.max(curFin, b);
        }
      }
      if (curFin > curIni) minutosOcupadosTotales += curFin - curIni;
    }

    const capacidadMinutosDia = spaces.length * TOTAL_HORAS * 60;
    const porcentajeOcupacion =
      capacidadMinutosDia > 0 ? Math.round((minutosOcupadosTotales / capacidadMinutosDia) * 100) : 0;

    return {
      disponiblesAhora,
      totalEspacios: spaces.length,
      practicasHoy: reservasVisibles.length,
      porcentajeOcupacion,
    };
  }, [espaciosFiltrados, q.data?.res, reservasPorEspacio, dia]);

  const toggleZona = (zona: string) => {
    setZonasAbiertas((prev) => ({ ...prev, [zona]: !(prev[zona] ?? true) }));
  };

  const pctDesdeMinutos = (min: number) => {
    const clamped = Math.max(H0 * 60, Math.min(H1 * 60, min));
    return ((clamped - H0 * 60) / (TOTAL_HORAS * 60)) * 100;
  };

  return (
    <TooltipProvider delayDuration={120}>
      <div className="space-y-4">
        <Titulo
          t="Tablero de disponibilidad"
          d="Línea de tiempo panorámica de espacios y subdivisiones (06:00 – 19:00)"
        />

        {/* 3 Tarjetas KPI minimalistas en línea */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="border-emerald-200/70 bg-card">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Espacios disponibles ahora</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">
                  {kpis.disponiblesAhora}{" "}
                  <span className="text-sm font-normal text-muted-foreground">/ {kpis.totalEspacios}</span>
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
                <DoorOpen className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Prácticas programadas hoy</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{kpis.practicasHoy}</p>
              </div>
              <div className="rounded-lg bg-rose-50 p-2.5 text-rose-600">
                <CalendarCheck2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Porcentaje de ocupación del día</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{kpis.porcentajeOcupacion}%</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <Percent className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Barra de filtros en una sola fila */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Input
                type="date"
                aria-label="Fecha"
                className="h-9 w-40 text-xs"
                value={dia}
                onChange={(e) => e.target.value && setDia(e.target.value)}
              />

              <select
                aria-label="Filtrar por piso o zona"
                value={zonaFiltro}
                onChange={(e) => setZonaFiltro(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground"
              >
                <option value="TODAS">Todas las zonas / pisos</option>
                {ZONAS.map(([z, label]) => (
                  <option key={z} value={z}>
                    {label}
                  </option>
                ))}
              </select>

              <div className="relative flex items-center">
                <Users className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  placeholder="Aforo mínimo"
                  aria-label="Aforo mínimo requerido"
                  value={aforoMinStr}
                  onChange={(e) => setAforoMinStr(e.target.value)}
                  className="h-9 w-36 pl-8 text-xs"
                />
              </div>
            </div>

            <LeyendaColores />
          </CardContent>
        </Card>

        {/* Línea de Tiempo de Recursos (06:00 a 19:00) */}
        <Card className="overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[960px]">
              {/* Cabecera de horas */}
              <div className="grid grid-cols-[260px_1fr] border-b bg-muted/40">
                <div className="sticky left-0 z-30 flex items-center justify-between border-r bg-muted/95 px-3 py-2.5 text-xs font-semibold text-foreground backdrop-blur-xs">
                  <span>Espacio / Subdivisión</span>
                  <span className="text-[11px] font-normal text-muted-foreground">Aforo</span>
                </div>
                <div className="relative grid grid-cols-13">
                  {HORAS.map((h) => (
                    <div
                      key={h}
                      className="border-l px-1.5 py-2.5 text-[11px] font-medium text-muted-foreground first:border-l-0"
                    >
                      {String(h).padStart(2, "0")}:00
                    </div>
                  ))}
                  <span className="pointer-events-none absolute right-1.5 top-2.5 text-[11px] font-medium text-muted-foreground">
                    19:00
                  </span>
                </div>
              </div>

              {/* Grupos por zona en acordeones colapsables */}
              {ZONAS.map(([zonaKey, zonaLabel]) => {
                const espaciosZona = espaciosFiltrados.filter(
                  (s: Row) => (s.zona ?? "PISO_2") === zonaKey
                );
                if (espaciosZona.length === 0) return null;
                const abierta = zonasAbiertas[zonaKey] ?? true;

                return (
                  <div key={zonaKey} className="border-b last:border-b-0">
                    {/* Encabezado del acordeón de zona */}
                    <button
                      type="button"
                      onClick={() => toggleZona(zonaKey)}
                      className="flex w-full items-center justify-between bg-muted/25 px-3 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted/50"
                    >
                      <span className="sticky left-3 inline-flex items-center gap-1.5">
                        {abierta ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        {zonaLabel}
                        <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px] font-normal">
                          {espaciosZona.length} {espaciosZona.length === 1 ? "espacio" : "espacios"}
                        </Badge>
                      </span>
                    </button>

                    {/* Filas de salones y subdivisiones */}
                    {abierta &&
                      espaciosZona.map((s: Row) => {
                        const rs = reservasPorEspacio.get(s.id) ?? [];
                        const carriles = asignarCarriles(rs);
                        const rowHeight = Math.max(44, (carriles[0]?.lanes ?? 1) * 32 + 12);

                        return (
                          <div
                            key={s.id}
                            className="grid grid-cols-[260px_1fr] border-t border-border/60 transition-colors hover:bg-muted/10"
                          >
                            {/* Eje Vertical Fijo */}
                            <div className="sticky left-0 z-20 flex items-center justify-between gap-2 border-r bg-card px-3 py-2">
                              <span className="truncate text-xs font-medium text-foreground" title={s.name}>
                                {s.name}
                              </span>
                              <Badge
                                variant="outline"
                                className={`shrink-0 text-[10px] font-normal ${
                                  aforoMin > 0
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : "text-muted-foreground"
                                }`}
                              >
                                Cap: {s.capacity ?? 0}
                              </Badge>
                            </div>

                            {/* Eje Horizontal (06:00 a 19:00) */}
                            <div
                              className="relative bg-emerald-50/50"
                              style={{ height: `${rowHeight}px` }}
                            >
                              {/* Rejilla horaria de fondo */}
                              <div className="pointer-events-none absolute inset-0 grid grid-cols-13">
                                {HORAS.map((h) => (
                                  <div key={h} className="border-l border-emerald-950/5 first:border-l-0" />
                                ))}
                              </div>

                              {/* Bloques / píldoras rojas de reservas activas */}
                              {carriles.map(({ r, lane, lanes }) => {
                                const iniMin = minutosBogota(r.starts_at);
                                const finMin = minutosBogota(r.ends_at);
                                if (finMin <= H0 * 60 || iniMin >= H1 * 60) return null;

                                const leftPct = pctDesdeMinutos(iniMin);
                                const rightPct = pctDesdeMinutos(finMin);
                                const widthPct = Math.max(1.5, rightPct - leftPct);
                                const modulo = r.activities?.name ?? "Práctica";
                                const docente =
                                  r.docente_responsable_nombre ?? r.solicitante_nombre ?? "Sin docente asignado";

                                const topPct = (lane / lanes) * 100;
                                const heightPct = 100 / lanes;

                                return (
                                  <Tooltip key={r.id}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => setDetalle({ reserva: r, space: s })}
                                        style={{
                                          left: `calc(${leftPct}% + 2px)`,
                                          width: `calc(${widthPct}% - 4px)`,
                                          top: `calc(${topPct}% + 4px)`,
                                          height: `calc(${heightPct}% - 8px)`,
                                        }}
                                        className="absolute z-10 flex items-center bg-rose-600 text-white rounded-lg shadow-sm px-2.5 py-1 text-xs font-medium truncate text-left transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                                      >
                                        <span className="truncate">{modulo}</span>
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs space-y-1 text-xs">
                                      <p className="font-semibold">{modulo}</p>
                                      <p>
                                        <span className="opacity-75">Docente:</span> {docente}
                                      </p>
                                      <p>
                                        <span className="opacity-75">Programa:</span> {r.programa ?? "—"}{" "}
                                        {r.semestre ? `· Semestre ${r.semestre}` : ""}
                                      </p>
                                      <p>
                                        <span className="opacity-75">Horario:</span> {hora(r.starts_at)} –{" "}
                                        {hora(r.ends_at)} · {r.participants ?? 0} est.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}

              {!q.isLoading && espaciosFiltrados.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No hay espacios que coincidan con los filtros seleccionados.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Modal de detalle completo al hacer clic sobre un bloque rojo */}
        <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-600" />
                {detalle?.reserva.activities?.name ?? "Detalle de reserva"}
              </DialogTitle>
            </DialogHeader>
            {detalle && (
              <dl className="grid grid-cols-[135px_1fr] gap-x-3 gap-y-2 rounded-lg border bg-muted/20 p-3.5 text-xs">
                <dt className="text-muted-foreground">Espacio</dt>
                <dd className="font-medium">{detalle.space.name}</dd>

                <dt className="text-muted-foreground">Docente</dt>
                <dd className="font-medium">
                  {detalle.reserva.docente_responsable_nombre ?? detalle.reserva.solicitante_nombre ?? "—"}
                </dd>

                <dt className="text-muted-foreground">Programa</dt>
                <dd>{detalle.reserva.programa ?? "—"}</dd>

                <dt className="text-muted-foreground">Semestre</dt>
                <dd>{detalle.reserva.semestre ? `${detalle.reserva.semestre}° semestre` : "—"}</dd>

                <dt className="text-muted-foreground">Módulo</dt>
                <dd className="font-medium">{detalle.reserva.activities?.name ?? "—"}</dd>

                <dt className="text-muted-foreground">Horario exacto</dt>
                <dd className="font-medium">
                  {hora(detalle.reserva.starts_at)} – {hora(detalle.reserva.ends_at)}
                </dd>

                <dt className="text-muted-foreground">N° de Estudiantes</dt>
                <dd className="font-semibold">
                  {detalle.reserva.participants ?? 0} estudiantes{" "}
                  <span className="font-normal text-muted-foreground">
                    (Aforo máx: {detalle.space.capacity ?? 0})
                  </span>
                </dd>
              </dl>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
