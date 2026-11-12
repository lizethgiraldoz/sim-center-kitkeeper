import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EstadoBadge } from "@/components/EstadoBadge";
import { useNoLeidos } from "@/lib/unread";
import { DetalleReserva } from "@/components/DetalleReserva";
import { Titulo } from "@/components/SoloAdmin";
import { notifyReservationPush } from "@/lib/push.functions";
import { RESERVA_SELECT, fmt, hora, useSessionUser, type Row } from "@/lib/app-data";
export const Route = createFileRoute("/_authenticated/mis-solicitudes")({
  head: () => ({ meta: [{ title: "Mis solicitudes · Laboratorio de Simulación UdeA" }] }),
  component: Page,
});
function Page() {
  const { data: me } = useSessionUser();
  const q = useQuery({
    queryKey: ["reservas", "mias", me?.id],
    enabled: !!me,
    queryFn: async () => (await supabase.from("reservations").select(RESERVA_SELECT).eq("teacher_id", me!.id).order("starts_at", { ascending: false })).data ?? [],
  });
  const noLeidos = useNoLeidos();
  const [sel, setSel] = useState<Row | null>(null);
  const [canc, setCanc] = useState<Row | null>(null);
  const [just, setJust] = useState("");
  const cancelar = async () => {
    const { error } = await supabase.rpc("cancelar_reserva_justificada", { _id: canc.id, _justificacion: just.trim() });
    if (error) toast.error(error.message); else { window.__lovableEvents?.track?.("project.reservation_status_changed", { status: "CANCELADA" }); void notifyReservationPush({ data: { reservationId: canc.id, title: "Reserva cancelada", body: `${canc.activities?.name ?? "Una reserva"} (${fmt(canc.starts_at)}) fue cancelada. Motivo: ${just.trim().slice(0, 100)}` } }).catch(() => {}); toast.success("Reserva cancelada"); setCanc(null); q.refetch(); }
  };
  const rows = q.data ?? [];
  return (
    <div>
      <Titulo t="Mis solicitudes" d="Historial y estado de tus reservas y préstamos externos" />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Actividad / Préstamo</TableHead><TableHead>Espacio / Modalidad</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Aún no tienes solicitudes.</TableCell></TableRow>}
            {rows.map((r: Row) => {
              const esExterna = !!r.leaves_faculty;
              const form = Array.isArray(r.external_borrow_forms) ? r.external_borrow_forms[0] : r.external_borrow_forms;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {esExterna ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>Préstamo externo: {form?.destination ?? "Salida externa"}</span>
                      </span>
                    ) : (
                      r.activities?.name
                    )}
                  </TableCell>
                  <TableCell>
                    {esExterna ? (
                      <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Salida externa (VA-SL-FO-010)
                      </span>
                    ) : (
                      r.spaces?.name ?? <span className="italic text-muted-foreground">Por asignar</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {esExterna
                      ? `${fmt(form?.departure_at ?? r.starts_at)} → ${fmt(form?.return_at ?? r.ends_at)}`
                      : `${fmt(r.starts_at)} – ${hora(r.ends_at)}`}
                  </TableCell>
                  <TableCell><EstadoBadge status={r.status} /></TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => setSel(r)}>Ver detalle{(noLeidos[r.id] ?? 0) > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground" aria-label="Mensajes sin leer">{noLeidos[r.id]}</span>}</Button>
                    {["SOLICITADA", "APROBADA"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => { setJust(""); setCanc(r); }}>Cancelar solicitud</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Dialog open={!!canc} onOpenChange={(o) => !o && setCanc(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>¿Deseas cancelar esta solicitud?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{canc?.leaves_faculty ? "Préstamo y salida externa" : canc?.activities?.name} · {canc && fmt(canc.starts_at)}</p>
          <Textarea className="text-gray-900" placeholder="Justificación de la cancelación (obligatoria)" value={just} maxLength={1000} onChange={(e) => setJust(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCanc(null)}>Volver</Button>
            <Button variant="destructive" disabled={just.trim().length < 3} onClick={cancelar}>Confirmar cancelación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {sel && <DetalleReserva r={rows.find((x: Row) => x.id === sel.id) ?? sel} open onOpenChange={(o) => !o && setSel(null)} onChanged={() => q.refetch()} />}
    </div>
  );
}