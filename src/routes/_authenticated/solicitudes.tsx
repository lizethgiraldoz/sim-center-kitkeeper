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
import { DetalleReserva } from "@/components/DetalleReserva";
import { ModalAprobacion } from "@/components/ModalAprobacion";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { RESERVA_SELECT, fmt, hora, useCatalogos, type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/solicitudes")({
  head: () => ({ meta: [{ title: "Gestión de solicitudes · Centro de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});

function Page() {
  const [filtro, setFiltro] = useState("SOLICITADA");
  const q = useQuery({
    queryKey: ["reservas", "todas"],
    queryFn: async () => (await supabase.from("reservations").select(RESERVA_SELECT).order("starts_at")).data ?? [],
  });
  const { data: cat } = useCatalogos();
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
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setVer(r)}>Detalle</Button>
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
