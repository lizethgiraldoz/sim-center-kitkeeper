import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarCheck, CalendarX2, Gauge, RefreshCw, Trophy, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { type Row } from "@/lib/app-data";
export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({
    meta: [
      { title: "Estadísticas · Laboratorio de Simulación UdeA" },
      { name: "description", content: "Panel de uso de laboratorios y recursos del Laboratorio de Simulación." },
    ],
  }),
  component: () => (
    <SoloAdmin>
      <Page />
    </SoloAdmin>
  ),
});
const VERDES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const ESTADO_COLOR: Record<string, string> = {
  APROBADA: "var(--success)",
  SOLICITADA: "var(--warning)",
  RECHAZADA: "var(--destructive)",
  EN_CURSO: "var(--chart-3)",
  CANCELADA: "var(--muted-foreground)",
  FINALIZADA: "var(--primary)",
};
const horaB = (iso: string) =>
  +new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit" }).slice(0, 2);
const dur = (r: Row) => Math.max(0, (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 3600000);
const count = <T,>(xs: T[], k: (x: T) => string, w: (x: T) => number = () => 1) =>
  Object.entries(
    xs.reduce<Record<string, number>>((a, x) => {
      const clave = k(x);
      a[clave] = (a[clave] ?? 0) + w(x);
      return a;
    }, {})
  ).map(([name, value]) => ({ name, value }));
function obtenerNombrePractica(r: Row): string {
  const act = Array.isArray(r.activities) ? r.activities[0] : r.activities;
  const titulo = String(r.titulo_practica ?? r.practice_title ?? r.nombre_practica ?? "").trim();
  const actName = String(act?.name ?? "").trim();
  if (titulo && actName && titulo.toLowerCase() !== actName.toLowerCase()) {
    return `${actName} · ${titulo}`;
  }
  return actName || titulo || "Práctica sin nombre";
}
function esRechazoPorDisponibilidad(r: Row): boolean {
  if (r.status !== "RECHAZADA") return false;
  const texto = `${r.rejection_reason ?? ""} ${r.motivo_rechazo ?? ""} ${r.notes ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /(disponibilidad|disponible|ocupad|cruce|cupo|sin sala|sin equipo|sin recurso|falta de equipo|no hay sala|no hay equipo|no hay recurso|aforo|insumo)/.test(
    texto
  );
}
function Page() {
  const now = new Date();
  const [desde, setDesde] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [vistaProg, setVistaProg] = useState("PORCENTAJE");
  const q = useQuery({
    queryKey: ["dashboard", desde, hasta],
    refetchOnMount: "always",
    queryFn: async () => {
      const [rRes, sRes, resItemsRes, catRes, actRes] = await Promise.all([
        supabase
          .from("reservations")
          .select("*, activities(id, name), spaces(id, name)")
          .gte("starts_at", new Date(`${desde}T00:00:00-05:00`).toISOString())
          .lte("starts_at", new Date(`${hasta}T23:59:59-05:00`).toISOString()),
        supabase.from("spaces").select("id, name"),
        supabase
          .from("reservation_resources")
          .select("reservation_id, resource_id, quantity, cantidad_aprobada, resources(id, name, category_id, resource_categories(name, kind))"),
        supabase.from("resources").select("id, name, quantity_total, resource_categories(name, kind)"),
        supabase.from("activities").select("id, name"),
      ]);
      if (rRes.error) throw rRes.error;
      const reservas = (rRes.data ?? []) as Row[];
      const idsPeriodo = new Set(reservas.map((r) => String(r.id)));
      const itemsPeriodo = ((resItemsRes.data ?? []) as Row[]).filter((it) =>
        idsPeriodo.has(String(it.reservation_id))
      );
      const itemsPorReserva = new Map<string, Row[]>();
      for (const it of itemsPeriodo) {
        const rid = String(it.reservation_id);
        const arr = itemsPorReserva.get(rid) ?? [];
        arr.push(it);
        itemsPorReserva.set(rid, arr);
      }
      const rsEnriquecidas = reservas.map((r) => ({
        ...r,
        reservation_resources: itemsPorReserva.get(String(r.id)) ?? [],
      }));
      return {
        rs: rsEnriquecidas,
        nSpaces: Math.max(1, sRes.data?.length ?? 1),
        totalRecursosCatalogo: catRes.data?.length ?? 0,
        totalPracticasCatalogo: actRes.data?.length ?? 0,
      };
    },
  });
  const rs = q.data?.rs ?? [];
  const activas = rs.filter((r) => ["APROBADA", "EN_CURSO", "FINALIZADA"].includes(r.status));
  const dias = Math.max(1, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000) + 1);
  const habiles = Math.max(1, Math.round((dias * 5) / 7));
  const ocup = Math.min(100, (activas.reduce((a, r) => a + dur(r), 0) / ((q.data?.nSpaces ?? 1) * habiles * 12)) * 100);
  const modulos = count(rs, (r) => obtenerNombrePractica(r)).sort((a, b) => b.value - a.value);
  const recursos = count(
    activas.flatMap((r) => r.reservation_resources ?? []),
    (x: Row) => {
      const resObj = Array.isArray(x.resources) ? x.resources[0] : x.resources;
      return String(resObj?.name ?? "Recurso sin nombre");
    },
    (x: Row) => Number(x.cantidad_aprobada ?? x.quantity ?? 0)
  ).sort((a, b) => b.value - a.value);
  const rechazadasDisp = rs.filter(esRechazoPorDisponibilidad);
  const practicasRechazadasDisp = count(rechazadasDisp, (r) => obtenerNombrePractica(r)).sort(
    (a, b) => b.value - a.value
  );
  const programasDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const r of activas) {
      const p = String(r.programa ?? "").trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [activas]);
  const programas = count(activas, (r) => String(r.programa ?? "").trim() || "Sin programa", dur).map((x) => ({
    ...x,
    value: +x.value.toFixed(1),
  }));
  const totalH = programas.reduce((a, p) => a + p.value, 0) || 1;
  const progPct = programas.map((p) => ({ name: p.name, value: +((p.value / totalH) * 100).toFixed(1) }));
  const progDetalle = count(
    activas.filter((r) => (String(r.programa ?? "").trim() || "Sin programa") === vistaProg),
    (r) => obtenerNombrePractica(r),
    dur
  )
    .map((x) => ({ ...x, value: +x.value.toFixed(1) }))
    .sort((a, b) => b.value - a.value);
  const datosProg = vistaProg === "PORCENTAJE" ? progPct : progDetalle;
  const estados = count(rs, (r) => r.status);
  const asist = count(
    rs.filter(
      (r) =>
        r.asistencia ||
        (["APROBADA", "EN_CURSO", "FINALIZADA"].includes(r.status) && new Date(r.ends_at) < now)
    ),
    (r) => (r.asistencia === "ASISTIO" ? "Asistió" : r.asistencia === "NO_ASISTIO" ? "No asistió" : "Sin registrar")
  );
  const ML: Record<string, string> = {
    PENDIENTE: "Pendiente",
    EN_MONTAJE: "En montaje",
    LISTO: "Listo",
    FALTA_EQUIPO: "Falta equipo",
  };
  const montaje = count(activas, (r) => ML[r.estado_montaje] ?? "Pendiente");
  const pico = Array.from({ length: 13 }, (_, i) => i + 7).map((h) => ({
    name: `${h}:00`,
    value: rs.filter(
      (r) =>
        r.status !== "CANCELADA" &&
        horaB(r.starts_at) <= h &&
        horaB(r.ends_at) + (new Date(r.ends_at).getMinutes() ? 1 : 0) > h
    ).length,
  }));
  const kpis = [
    {
      t: "Reservas del periodo",
      v: rs.length,
      sub: `${q.data?.totalPracticasCatalogo ?? 0} prácticas · ${q.data?.totalRecursosCatalogo ?? 0} recursos en catálogo`,
      i: CalendarCheck,
    },
    { t: "Ocupación de laboratorios", v: `${ocup.toFixed(0)}%`, sub: `${q.data?.nSpaces ?? 1} sala(s) activas`, i: Gauge },
    {
      t: "Práctica más solicitada",
      v: modulos[0]?.name ?? "—",
      sub: modulos[0] ? `${modulos[0].value} solicitud(es)` : null,
      i: Trophy,
    },
    {
      t: "Recurso / insumo más usado",
      v: recursos[0]?.name ?? "—",
      sub: recursos[0] ? `${recursos[0].value} unidad(es) asignadas` : null,
      i: Wrench,
    },
    {
      t: "Más rechazada por disponibilidad",
      v: practicasRechazadasDisp[0]?.name ?? "Ninguna",
      sub: practicasRechazadasDisp[0]
        ? `${practicasRechazadasDisp[0].value} rechazo(s) · ${rechazadasDisp.length} total`
        : "0 rechazos por disponibilidad",
      i: CalendarX2,
    },
  ];
  return (
    <div className="space-y-6">
      <Titulo t="Estadísticas" d="Uso actualizado de laboratorios, prácticas, equipos, insumos y demanda horaria" />
      <div className="flex flex-wrap gap-2 items-center justify-between text-sm">
        <div className="flex flex-wrap gap-2 items-center">
          Desde <Input type="date" className="w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
          hasta <Input type="date" className="w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
          Actualizar datos
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.t} className="rounded-xl shadow-sm transition hover:shadow-md hover:-translate-y-0.5">
            <CardContent className="p-4 flex gap-3 items-center">
              <span className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 text-primary grid place-items-center">
                <k.i className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{k.t}</p>
                <p className="text-lg font-bold truncate" title={String(k.v)}>
                  {k.v}
                </p>
                {k.sub && (
                  <p className="text-[11px] text-muted-foreground truncate" title={k.sub}>
                    {k.sub}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">Uso de horas por programa</CardTitle>
            <Tabs value={vistaProg} onValueChange={setVistaProg}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="PORCENTAJE">Comparativo %</TabsTrigger>
                {programasDisponibles.map((prog) => (
                  <TabsTrigger key={prog} value={prog}>
                    {prog}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="h-72">
            {datosProg.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin reservas aprobadas en el periodo.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={datosProg}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis
                    fontSize={11}
                    domain={vistaProg === "PORCENTAJE" ? [0, 100] : [0, "auto"]}
                    unit={vistaProg === "PORCENTAJE" ? "%" : "h"}
                  />
                  <Tooltip formatter={(v: number) => (vistaProg === "PORCENTAJE" ? `${v}% de las horas` : `${v} h`)} />
                  <Bar dataKey="value" name={vistaProg === "PORCENTAJE" ? "Participación" : "Horas"} radius={[8, 8, 0, 0]}>
                    {datosProg.map((_, i) => (
                      <Cell key={i} fill={VERDES[i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Distribución de estados</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={estados} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                  {estados.map((e) => (
                    <Cell key={e.name} fill={ESTADO_COLOR[e.name] ?? "var(--chart-2)"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Recursos e insumos más utilizados</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {recursos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin recursos o insumos asignados en el periodo.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={recursos.slice(0, 8)} layout="vertical" margin={{ left: 20, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="name" width={190} fontSize={11} />
                  <Tooltip formatter={(v: number) => [`${v} unidad(es)`, "Asignadas"]} />
                  <Bar dataKey="value" name="Unidades" radius={[0, 8, 8, 0]}>
                    {recursos.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={VERDES[i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Asistencia de docentes</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {asist.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin registros de asistencia en el periodo.</p>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={asist} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                    {asist.map((e) => (
                      <Cell
                        key={e.name}
                        fill={
                          e.name === "Asistió"
                            ? "var(--success)"
                            : e.name === "No asistió"
                              ? "var(--destructive)"
                              : "var(--muted-foreground)"
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Montaje de prácticas</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {montaje.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin prácticas aprobadas en el periodo.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={montaje}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="value" name="Prácticas" radius={[8, 8, 0, 0]}>
                    {montaje.map((_, i) => (
                      <Cell key={i} fill={VERDES[i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Prácticas más rechazadas por disponibilidad</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {practicasRechazadasDisp.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin prácticas rechazadas por disponibilidad en el periodo seleccionado.
              </p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={practicasRechazadasDisp.slice(0, 10)} layout="vertical" margin={{ left: 20, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="name" width={190} fontSize={11} />
                  <Tooltip formatter={(v: number) => [`${v} rechazo(s)`, "Por disponibilidad"]} />
                  <Bar dataKey="value" name="Rechazos por disponibilidad" fill="var(--destructive)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Horas pico de demanda</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <LineChart data={pico}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="value" name="Reservas" stroke="var(--primary)" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      {rs.length === 0 && <p className="text-sm text-muted-foreground">No hay reservas en este periodo.</p>}
    </div>
  );
}