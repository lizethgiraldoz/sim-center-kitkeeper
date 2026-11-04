import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { CalendarCheck, Gauge, Trophy, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({ meta: [{ title: "Estadísticas · Laboratorio de Simulación UdeA" }, { name: "description", content: "Panel de uso de laboratorios y recursos del Laboratorio de Simulación." }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});

const VERDES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const ESTADO_COLOR: Record<string, string> = { APROBADA: "var(--success)", SOLICITADA: "var(--warning)", RECHAZADA: "var(--destructive)", EN_CURSO: "var(--chart-3)", CANCELADA: "var(--muted-foreground)" };
const horaB = (iso: string) => +new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit" }).slice(0, 2);
const dur = (r: Row) => (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 3600000;
const count = <T,>(xs: T[], k: (x: T) => string, w: (x: T) => number = () => 1) =>
  Object.entries(xs.reduce<Record<string, number>>((a, x) => { a[k(x)] = (a[k(x)] ?? 0) + w(x); return a; }, {})).map(([name, value]) => ({ name, value }));

function Page() {
  const now = new Date();
  const [desde, setDesde] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [vistaProg, setVistaProg] = useState("PORCENTAJE");
  const [hasta, setHasta] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
  const q = useQuery({
    queryKey: ["dashboard", desde, hasta],
    queryFn: async () => {
      const [r, s] = await Promise.all([
        supabase.from("reservations").select("id, status, programa, starts_at, ends_at, space_id, activities(name), reservation_resources(quantity, resources(name))")
          .gte("starts_at", new Date(`${desde}T00:00:00-05:00`).toISOString()).lte("starts_at", new Date(`${hasta}T23:59:59-05:00`).toISOString()),
        supabase.from("spaces").select("id"),
      ]);
      return { rs: (r.data ?? []) as Row[], nSpaces: s.data?.length ?? 1 };
    },
  });
  const rs = q.data?.rs ?? [];
  const activas = rs.filter((r) => ["APROBADA", "EN_CURSO"].includes(r.status));
  const dias = Math.max(1, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000) + 1);
  const habiles = Math.max(1, Math.round(dias * 5 / 7));
  const ocup = Math.min(100, (activas.reduce((a, r) => a + dur(r), 0) / ((q.data?.nSpaces ?? 1) * habiles * 12)) * 100);
  const modulos = count(rs, (r) => r.activities?.name ?? "—").sort((a, b) => b.value - a.value);
  const recursos = count(activas.flatMap((r) => r.reservation_resources ?? []), (x: Row) => x.resources?.name ?? "—", (x: Row) => x.quantity).sort((a, b) => b.value - a.value);
  const programas = count(activas, (r) => r.programa ?? "—", dur).map((x) => ({ ...x, value: +x.value.toFixed(1) }));
  const totalH = programas.reduce((a, p) => a + p.value, 0) || 1;
  const progPct = programas.map((p) => ({ name: p.name, value: +((p.value / totalH) * 100).toFixed(1) }));
  const progDetalle = count(activas.filter((r) => (r.programa ?? "").toLowerCase().includes(vistaProg.toLowerCase())), (r) => r.activities?.name ?? "—", dur).map((x) => ({ ...x, value: +x.value.toFixed(1) }));
  const datosProg = vistaProg === "PORCENTAJE" ? progPct : progDetalle;
  const estados = count(rs, (r) => r.status);
  const asist = count(rs.filter((r) => r.asistencia || (["APROBADA", "EN_CURSO"].includes(r.status) && new Date(r.ends_at) < now)),
    (r) => r.asistencia === "ASISTIO" ? "Asistió" : r.asistencia === "NO_ASISTIO" ? "No asistió" : "Sin registrar");
  const ML: Record<string, string> = { PENDIENTE: "Pendiente", EN_MONTAJE: "En montaje", LISTO: "Listo", FALTA_EQUIPO: "Falta equipo" };
  const montaje = count(activas, (r) => ML[r.estado_montaje] ?? "Pendiente");
  const inasist = rs.filter((r) => r.asistencia === "NO_ASISTIO").length;
  const pico = Array.from({ length: 13 }, (_, i) => i + 7).map((h) => ({
    name: `${h}:00`, value: rs.filter((r) => r.status !== "CANCELADA" && horaB(r.starts_at) <= h && horaB(r.ends_at) + (new Date(r.ends_at).getMinutes() ? 1 : 0) > h).length,
  }));

  const kpis = [
    { t: "Reservas del periodo", v: rs.length, i: CalendarCheck },
    { t: "Ocupación de laboratorios", v: `${ocup.toFixed(0)}%`, i: Gauge },
    { t: "Módulo más solicitado", v: modulos[0]?.name ?? "—", i: Trophy },
    { t: "Recurso de mayor uso", v: recursos[0]?.name ?? "—", i: Wrench },
  ];

  return (
    <div className="space-y-6">
      <Titulo t="Estadísticas" d="Uso de laboratorios, recursos y demanda horaria" />
      <div className="flex flex-wrap gap-2 items-center text-sm">
        Desde <Input type="date" className="w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        hasta <Input type="date" className="w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.t} className="rounded-xl shadow-sm transition hover:shadow-md hover:-translate-y-0.5">
            <CardContent className="p-4 flex gap-3 items-center">
              <span className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 text-primary grid place-items-center"><k.i className="h-5 w-5" /></span>
              <div className="min-w-0"><p className="text-xs text-muted-foreground">{k.t}</p><p className="text-lg font-bold truncate" title={String(k.v)}>{k.v}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-xl shadow-sm"><CardHeader className="space-y-2"><CardTitle className="text-base">Uso de horas por programa</CardTitle>
          <Tabs value={vistaProg} onValueChange={setVistaProg}><TabsList><TabsTrigger value="PORCENTAJE">Comparativo %</TabsTrigger><TabsTrigger value="Medicina">Medicina</TabsTrigger><TabsTrigger value="Enfermería">Enfermería</TabsTrigger></TabsList></Tabs></CardHeader>
          <CardContent className="h-72">{datosProg.length === 0 ? <p className="text-sm text-muted-foreground">Sin reservas aprobadas en el periodo.</p> : <ResponsiveContainer>
            <BarChart data={datosProg}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} domain={vistaProg === "PORCENTAJE" ? [0, 100] : [0, "auto"]} unit={vistaProg === "PORCENTAJE" ? "%" : "h"} /><Tooltip formatter={(v: number) => vistaProg === "PORCENTAJE" ? `${v}% de las horas` : `${v} h`} />
              <Bar dataKey="value" name={vistaProg === "PORCENTAJE" ? "Participación" : "Horas"} radius={[8, 8, 0, 0]}>{datosProg.map((_, i) => <Cell key={i} fill={VERDES[i % 5]} />)}</Bar></BarChart>
          </ResponsiveContainer>}</CardContent></Card>
        <Card className="rounded-xl shadow-sm"><CardHeader><CardTitle className="text-base">Distribución de estados</CardTitle></CardHeader>
          <CardContent className="h-72"><ResponsiveContainer>
            <PieChart><Pie data={estados} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
              {estados.map((e) => <Cell key={e.name} fill={ESTADO_COLOR[e.name] ?? "var(--chart-2)"} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer></CardContent></Card>
        <Card className="rounded-xl shadow-sm"><CardHeader><CardTitle className="text-base">Asistencia de docentes</CardTitle></CardHeader>
          <CardContent className="h-72">{asist.length === 0 ? <p className="text-sm text-muted-foreground">Sin registros de asistencia en el periodo.</p> : <ResponsiveContainer>
            <PieChart><Pie data={asist} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
              {asist.map((e) => <Cell key={e.name} fill={e.name === "Asistió" ? "var(--success)" : e.name === "No asistió" ? "var(--destructive)" : "var(--muted-foreground)"} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer>}</CardContent></Card>
        <Card className="rounded-xl shadow-sm"><CardHeader><CardTitle className="text-base">Montaje de prácticas</CardTitle></CardHeader>
          <CardContent className="h-72">{montaje.length === 0 ? <p className="text-sm text-muted-foreground">Sin prácticas aprobadas en el periodo.</p> : <ResponsiveContainer>
            <BarChart data={montaje}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip />
              <Bar dataKey="value" name="Prácticas" radius={[8, 8, 0, 0]}>{montaje.map((_, i) => <Cell key={i} fill={VERDES[i % 5]} />)}</Bar></BarChart>
          </ResponsiveContainer>}</CardContent></Card>
        <Card className="rounded-xl shadow-sm lg:col-span-2"><CardHeader><CardTitle className="text-base">Horas pico de demanda</CardTitle></CardHeader>
          <CardContent className="h-64"><ResponsiveContainer>
            <LineChart data={pico}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip />
              <Line type="monotone" dataKey="value" name="Reservas" stroke="var(--primary)" strokeWidth={3} dot={{ r: 3 }} /></LineChart>
          </ResponsiveContainer></CardContent></Card>
      </div>
      {rs.length === 0 && <p className="text-sm text-muted-foreground">No hay reservas en este periodo.</p>}
    </div>
  );
}
