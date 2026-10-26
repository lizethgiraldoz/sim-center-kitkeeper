import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoBadge } from "@/components/EstadoBadge";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { fmt, type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({ meta: [{ title: "Reportes y auditoría · Centro de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});

function Page() {
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const rango = { _from: new Date(`${desde}T00:00:00-05:00`).toISOString(), _to: new Date(`${hasta}T23:59:59-05:00`).toISOString() };
  const q = useQuery({
    queryKey: ["reportes", desde, hasta],
    queryFn: async () => {
      const [u, p, a, pr] = await Promise.all([
        supabase.rpc("reporte_utilizacion", rango),
        supabase.rpc("reporte_uso_programa_docente", rango),
        supabase.from("reservation_audit").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      const nombres = Object.fromEntries((pr.data ?? []).map((x) => [x.id, x.full_name || x.email]));
      return { uso: (u.data ?? []).sort((x, y) => y.horas - x.horas), prog: p.data ?? [], audit: a.data ?? [], nombres };
    },
  });
  const max = Math.max(1, ...(q.data?.uso.map((x) => x.horas) ?? [1]));
  return (
    <div className="space-y-6">
      <Titulo t="Reportes y auditoría" d="Uso de laboratorios y recursos; historial inmutable de cambios" />
      <div className="flex flex-wrap gap-2 items-center text-sm">
        Desde <Input type="date" className="w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        hasta <Input type="date" className="w-40" value={hasta} max={undefined} onChange={(e) => setHasta(e.target.value || hoy)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Uso por espacio y recurso (horas)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {q.data?.uso.filter((x) => x.reservas > 0).length === 0 && <p className="text-sm text-muted-foreground">Sin uso en el periodo.</p>}
            {q.data?.uso.filter((x) => x.reservas > 0).slice(0, 15).map((x) => (
              <div key={x.kind + x.id} className="text-xs">
                <div className="flex justify-between"><span className="truncate">{x.name}</span><span>{Number(x.horas).toFixed(1)} h · {x.reservas}</span></div>
                <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(x.horas / max) * 100}%` }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por programa y docente</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Programa</TableHead><TableHead>Docente</TableHead><TableHead className="text-right">Reservas</TableHead><TableHead className="text-right">Horas</TableHead></TableRow></TableHeader>
              <TableBody>{q.data?.prog.map((x, i) => (
                <TableRow key={i}><TableCell>{x.programa}</TableCell><TableCell>{x.docente}</TableCell><TableCell className="text-right">{x.reservas}</TableCell><TableCell className="text-right">{Number(x.horas).toFixed(1)}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Registro de auditoría</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Acción</TableHead><TableHead>Usuario</TableHead><TableHead>Cambio de estado</TableHead><TableHead>Reserva</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data?.audit.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin eventos.</TableCell></TableRow>}
              {q.data?.audit.map((a: Row) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{fmt(a.created_at)}</TableCell>
                  <TableCell>{a.action}</TableCell>
                  <TableCell>{q.data.nombres[a.actor_id] ?? "Sistema"}</TableCell>
                  <TableCell className="whitespace-nowrap">{a.old_status && <EstadoBadge status={a.old_status} />}{a.old_status && a.new_status && " → "}{a.new_status && <EstadoBadge status={a.new_status} />}</TableCell>
                  <TableCell className="font-mono text-xs">{a.reservation_id.slice(0, 8)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
