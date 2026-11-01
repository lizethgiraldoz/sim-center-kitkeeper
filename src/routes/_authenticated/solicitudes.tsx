import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EstadoBadge } from "@/components/EstadoBadge";
import { useNoLeidos } from "@/lib/unread";
import { DetalleReserva } from "@/components/DetalleReserva";
import { ModalAprobacion } from "@/components/ModalAprobacion";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { RESERVA_SELECT, fmt, hora, useCatalogos, type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/solicitudes")({
  head: () => ({ meta: [{ title: "Gestión de solicitudes · Laboratorio de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});

function Page() {
  const [filtro, setFiltro] = useState("SOLICITADA");
  const q = useQuery({
    queryKey: ["reservas", "todas"],
    queryFn: async () => (await supabase.from("reservations").select(RESERVA_SELECT).order("starts_at")).data ?? [],
  });
  const { data: cat } = useCatalogos();
  const noLeidos = useNoLeidos();
  const [ver, setVer] = useState<Row | null>(null);
  const [rechazo, setRechazo] = useState<Row | null>(null);
  const [motivo, setMotivo] = useState("");
  const [reasig, setReasig] = useState<Row | null>(null);
  const [espacio, setEspacio] = useState("");
  const [aprobar, setAprobar] = useState<Row | null>(null);

  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p;
    if (error) toast.error(error.message); else toast.success(ok);
    q.refetch();
    return !error;
  };
  const rows = (q.data ?? []).filter((r: Row) => filtro === "TODAS" || r.status === filtro);

  return (
    <div>
      <Titulo t="Gestión de solicitudes" d="Aprobar bloquea automáticamente los recursos; se valida cruce de horarios y cierre a las 19:00" />
      <Tabs value={filtro} onValueChange={setFiltro} className="mb-4">
        <TabsList className="flex-wrap h-auto">
          {["SOLICITADA", "APROBADA", "RECHAZADA", "CANCELADA", "TODAS"].map((s) => <TabsTrigger key={s} value={s}>{s === "TODAS" ? "Todas" : s.charAt(0) + s.slice(1).toLowerCase()}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No hay solicitudes en este estado.</p>}
        {rows.map((r: Row) => (
          <Card key={r.id}><CardContent className="p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-56">
              <div className="flex items-center gap-2"><EstadoBadge status={r.status} /><strong>{r.activities?.name}</strong></div>
              <p className="text-sm text-muted-foreground">{r.spaces?.name ?? "Espacio por asignar"} · {fmt(r.starts_at)} – {hora(r.ends_at)} · {r.participants} participantes</p>
              <p className="text-xs text-muted-foreground">{r.docente_responsable_nombre ?? r.solicitante_nombre ?? "—"} · {r.programa}{r.leaves_faculty ? " · Salida externa" : ""}</p>
              {r.notes?.trim() && <p className="text-xs mt-1 text-foreground"><strong>Observaciones:</strong> {r.notes}</p>}
              {r.status === "CANCELADA" && r.justificacion_cancelacion && <p className="text-xs mt-1 rounded bg-muted px-2 py-1 text-foreground"><strong>Cancelada por el docente:</strong> {r.justificacion_cancelacion}</p>}
              {r.status === "APROBADA" && <Seguimiento r={r} onChanged={() => q.refetch()} />}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setVer(r)}>Ver detalle{(noLeidos[r.id] ?? 0) > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground" aria-label="Mensajes sin leer">{noLeidos[r.id]}</span>}</Button>
              {r.status === "SOLICITADA" && <>
                <Button size="sm" onClick={() => setAprobar(r)}>Aprobar</Button>
                <Button size="sm" variant="destructive" onClick={() => { setMotivo(""); setRechazo(r); }}>Rechazar</Button>
              </>}
              {(r.status === "APROBADA" || (r.status === "SOLICITADA" && r.space_id)) && <Button size="sm" variant="outline" onClick={() => { setEspacio(""); setReasig(r); }}>Reasignar espacio</Button>}
            </div>
          </CardContent></Card>
        ))}
      </div>

      <Dialog open={!!rechazo} onOpenChange={(o) => !o && setRechazo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar solicitud</DialogTitle></DialogHeader>
          <Textarea placeholder="Motivo de la decisión (se notificará al docente)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter><Button variant="destructive" disabled={!motivo.trim()} onClick={async () => { if (await run(supabase.rpc("rechazar_reserva", { _id: rechazo.id, _reason: motivo.trim() }), "Reserva rechazada")) setRechazo(null); }}>Confirmar rechazo</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reasig} onOpenChange={(o) => !o && setReasig(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reasignar espacio</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Actual: {reasig?.spaces?.name}. Los equipos e insumos se mantienen.</p>
          <select className="border rounded-md px-2 h-9 bg-background text-sm w-full" value={espacio} onChange={(e) => setEspacio(e.target.value)}>
            <option value="">Seleccione un espacio…</option>
            {cat?.spaces.filter((s: Row) => s.id !== reasig?.space_id).map((s: Row) => <option key={s.id} value={s.id}>{s.name} · cap. {s.capacity}</option>)}
          </select>
          <DialogFooter><Button disabled={!espacio} onClick={async () => { if (await run(supabase.rpc("reasignar_espacio", { _id: reasig.id, _new_space_id: espacio }), "Espacio reasignado")) setReasig(null); }}>Aplicar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {aprobar && <ModalAprobacion r={aprobar} spaces={cat?.spaces ?? []} onClose={() => setAprobar(null)} onDone={() => { setAprobar(null); q.refetch(); }} />}
      {ver && <DetalleReserva r={ver} open onOpenChange={(o) => !o && setVer(null)} onChanged={() => q.refetch()} />}
    </div>
  );
}

const MONTAJE = [
  { v: "PENDIENTE", l: "Pendiente", c: "bg-destructive" },
  { v: "EN_MONTAJE", l: "En montaje", c: "bg-warning" },
  { v: "LISTO", l: "Listo", c: "bg-success" },
  { v: "FALTA_EQUIPO", l: "Falta equipo", c: "bg-orange" },
];
const SALIDA = [{ v: "AUTORIZADA", l: "Autorizada salida" }, { v: "ENTREGADO", l: "Entregado" }, { v: "RETORNADO", l: "Recibido / Retornado" }];

function Seguimiento({ r, onChanged }: { r: Row; onChanged: () => void }) {
  const set = async (campo: string, valor: string, detalle?: string) => {
    const { error } = await supabase.rpc("actualizar_seguimiento", { _id: r.id, _campo: campo, _valor: valor, ...(detalle ? { _detalle: detalle } : {}) });
    if (error) toast.error(error.message); else { toast.success("Seguimiento actualizado"); onChanged(); }
  };
  const actual = MONTAJE.find((m) => m.v === r.estado_montaje) ?? MONTAJE[0]!;
  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-muted/40 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Montaje:</span>
        <span className={`inline-block h-3 w-3 rounded-full ${actual.c}`} aria-hidden />
        <select className="h-7 rounded border px-1" value={actual.v} onChange={(e) => {
          const v = e.target.value;
          if (v === "FALTA_EQUIPO") { const d = window.prompt("¿Qué equipo falta?"); if (d) set("montaje", v, d); }
          else set("montaje", v);
        }}>{MONTAJE.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select>
        {r.estado_montaje === "FALTA_EQUIPO" && r.falta_equipo && <span className="text-destructive">Falta: {r.falta_equipo}</span>}
      </div>
      {r.leaves_faculty && <div className="flex flex-wrap items-center gap-1">
        <span className="font-semibold">Salida externa:</span>
        {SALIDA.map((s, i) => {
          const idx = SALIDA.findIndex((x) => x.v === r.salida_estado);
          return <Button key={s.v} size="sm" className="h-7" variant={idx >= i ? "default" : "outline"} disabled={i !== idx + 1} onClick={() => set("salida", s.v)}>{s.l}</Button>;
        })}
      </div>}
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-semibold">Asistencia del docente:</span>
        {r.asistencia === "ASISTIO" ? <span className="text-success font-semibold">Asistió</span> : <>
          <Button size="sm" className="h-7" variant="outline" onClick={() => set("asistencia", "ASISTIO")}>Asistió</Button>
          <Button size="sm" className="h-7" variant="destructive" onClick={() => { if (window.confirm("Se registrará la ausencia y se liberará el espacio. ¿Continuar?")) set("asistencia", "NO_ASISTIO"); }}>No asistió</Button>
        </>}
      </div>
    </div>
  );
}
