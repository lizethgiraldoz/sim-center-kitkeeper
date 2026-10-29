import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EstadoBadge } from "@/components/EstadoBadge";
import { FormatoPreviewModal, NOTA_30 } from "@/components/FormularioReserva";
import { supabase } from "@/integrations/supabase/client";
import { fmt, hora, type Row } from "@/lib/app-data";
import { toast } from "sonner";
import { ChatReserva } from "@/components/ChatReserva";

export function DetalleReserva({ r, open, onOpenChange, onChanged }: { r: Row; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const [print, setPrint] = useState(false);
  const form = Array.isArray(r.external_borrow_forms) ? r.external_borrow_forms[0] : r.external_borrow_forms;
  const [ext, setExt] = useState({ responsible_name: "", responsible_document: "", responsible_phone: "", destination: "", purpose: "" });
  const labels: Record<string, string> = { responsible_name: "Responsable", responsible_document: "Documento", responsible_phone: "Teléfono", destination: "Destino", purpose: "Propósito" };
  const guardar = async () => {
    const { error } = await supabase.from("external_borrow_forms").update({ ...ext, departure_at: r.starts_at, return_at: r.ends_at, accepts_responsibility: true }).eq("id", form.id);
    if (error) toast.error(error.message); else { toast.success("Formato de salida guardado"); onChanged(); }
  };
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>{r.activities?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2 items-center"><EstadoBadge status={r.status} />{r.leaves_faculty && <span className="text-xs border rounded px-2">Salida externa</span>}</div>
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-muted-foreground">Espacio</dt><dd>{r.spaces?.name ?? <span className="italic text-muted-foreground">Por asignar (administrador)</span>}</dd>
              <dt className="text-muted-foreground">Horario</dt><dd>{fmt(r.starts_at)} – {hora(r.ends_at)}</dd>
              <dt className="text-muted-foreground">Programa / semestre</dt><dd>{r.programa} · {r.semestre ?? "—"}</dd>
              <dt className="text-muted-foreground">Participantes</dt><dd>{r.participants}</dd>
              <dt className="text-muted-foreground">Docente responsable</dt><dd>{r.docente_responsable_nombre ?? "—"}</dd>
            </dl>
            <div className="rounded-md border bg-accent/40 px-3 py-2"><p className="font-semibold mb-0.5">Observaciones del docente</p><p className="whitespace-pre-wrap text-foreground">{r.notes?.trim() ? r.notes : <span className="italic text-muted-foreground">Sin observaciones</span>}</p></div>
            {r.rejection_reason && <p className="rounded-md bg-destructive/10 text-destructive px-3 py-2"><strong>Motivo del rechazo:</strong> {r.rejection_reason}</p>}
            {r.justificacion_cancelacion && <p className="rounded-md bg-muted px-3 py-2"><strong>Justificación de la cancelación:</strong> {r.justificacion_cancelacion}</p>}
            {r.requiere_ingreso_30min_antes && <p className="rounded-md bg-accent px-3 py-2">{NOTA_30}</p>}
            <div>
              <p className="font-semibold mb-1">Equipos e insumos</p>
              <ul className="text-xs space-y-0.5">{r.reservation_resources?.map((x: Row, i: number) => <li key={i}>{x.quantity} × {x.resources?.name}</li>)}</ul>
            </div>
            {r.leaves_faculty && form && r.status === "SOLICITADA" && !form.accepts_responsibility && (
              <div className="border rounded-md p-3 space-y-2">
                <p className="font-semibold">Formato de salida externa (obligatorio para aprobar)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(ext) as (keyof typeof ext)[]).map((k) => <Input key={k} placeholder={labels[k]} value={ext[k]} onChange={(e) => setExt({ ...ext, [k]: e.target.value })} />)}
                </div>
                <Button size="sm" onClick={guardar}>Guardar y aceptar responsabilidad</Button>
              </div>
            )}
            {r.leaves_faculty && form?.accepts_responsibility && (
              <div className="rounded-xl border p-3 text-xs grid grid-cols-2 gap-1">
                <p className="col-span-2 font-semibold text-sm">Préstamo y salida externa</p>
                <span className="text-muted-foreground">Destino</span><span>{form.destination}</span>
                <span className="text-muted-foreground">Responsable</span><span>{form.responsible_name} · {form.responsible_phone}</span>
                <span className="text-muted-foreground">Transporte</span><span>{form.transport_vehicle ?? "—"}</span>
                <span className="text-muted-foreground">Salida / retorno</span><span>{form.departure_at ? fmt(form.departure_at) : "—"} → {form.return_at ? fmt(form.return_at) : "—"}</span>
                <span className="text-muted-foreground">Inventario</span><span className="whitespace-pre-wrap">{form.inventory_detail ?? "—"}</span>
              </div>
            )}
            <ChatReserva reservationId={r.id} teacherId={r.teacher_id} />
            <Button variant="outline" size="sm" onClick={() => setPrint(true)}>Ver formato F-CS-01</Button>
            {print && <FormatoPreviewModal r={r} onClose={() => setPrint(false)} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
