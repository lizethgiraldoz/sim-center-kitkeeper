import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EstadoBadge } from "@/components/EstadoBadge";
import { FormatoPreviewModal, NOTA_30 } from "@/components/FormularioReserva";
import { FormatoSalidaModal } from "@/components/FormatoSalida";
import { RelojHora } from "@/components/RelojHora";
import { supabase } from "@/integrations/supabase/client";
import { fmt, hora, useSessionUser, type Row } from "@/lib/app-data";
import { notifyReservationPush } from "@/lib/push.functions";
import { toast } from "sonner";
import { ChatReserva } from "@/components/ChatReserva";
import { Textarea } from "@/components/ui/textarea";

const ESTADO_SALIDA: Record<string, string> = {
  PENDIENTE_AUTORIZACION_SALIDA: "Pendiente de autorización",
  SALIDA_APROBADA: "Salida aprobada",
  SALIDA_RECHAZADA: "Salida rechazada",
};

export function DetalleReserva({ r, open, onOpenChange, onChanged }: { r: Row; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const [print, setPrint] = useState(false);
  const [printSalida, setPrintSalida] = useState(false);
  const [repro, setRepro] = useState(false);
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
                <p className="col-span-2 font-semibold text-sm flex flex-wrap items-center gap-2">Préstamo y salida externa (VA-SL-FO-010)
                  <span className={`rounded px-2 py-0.5 ${form.estado === "SALIDA_APROBADA" ? "bg-success/25 text-foreground" : form.estado === "SALIDA_RECHAZADA" ? "bg-destructive/15 text-destructive" : "bg-warning/30 text-foreground"}`}>{ESTADO_SALIDA[form.estado] ?? form.estado}</span>
                </p>
                <span className="text-muted-foreground">Destino</span><span>{form.destination}</span>
                <span className="text-muted-foreground">Responsable</span><span>{form.responsible_name} · {form.responsible_phone}</span>
                <span className="text-muted-foreground">Cargo / correo</span><span>{form.cargo ?? "—"} · {form.correo_institucional ?? "—"}</span>
                <span className="text-muted-foreground">Transporte</span><span>{form.transport_vehicle ?? "—"}</span>
                <span className="text-muted-foreground">Salida / retorno</span><span>{form.departure_at ? fmt(form.departure_at) : "—"} → {form.return_at ? fmt(form.return_at) : "—"}</span>
                <span className="text-muted-foreground">Elementos</span><span className="whitespace-pre-wrap">{form.inventory_detail ?? "—"}</span>
                {form.autoriza_nombre && <><span className="text-muted-foreground">Autoriza (Lab. Simulación)</span><span>{form.autoriza_nombre} · {form.autoriza_cargo}</span></>}
                {form.observaciones && <><span className="text-muted-foreground">Observaciones</span><span className="whitespace-pre-wrap">{form.observaciones}</span></>}
              </div>
            )}
            {r.leaves_faculty && form?.accepts_responsibility && form.estado === "PENDIENTE_AUTORIZACION_SALIDA" && (
              <AutorizacionSalida r={r} form={form} onChanged={onChanged} />
            )}
            <ChatReserva reservationId={r.id} teacherId={r.teacher_id} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPrint(true)}>Ver formato F-CS-01</Button>
              {r.leaves_faculty && form?.estado === "SALIDA_APROBADA" && (
                <Button variant="outline" size="sm" onClick={() => setPrintSalida(true)}>Imprimir Formato VA-SL-FO-010</Button>
              )}
              {["SOLICITADA", "APROBADA"].includes(r.status) && <Button variant="outline" size="sm" onClick={() => setRepro(true)}>Reprogramar</Button>}
            </div>
            {print && <FormatoPreviewModal r={r} onClose={() => setPrint(false)} />}
            {printSalida && <FormatoSalidaModal r={r} onClose={() => setPrintSalida(false)} />}
          </div>
        </DialogContent>
      </Dialog>
      {repro && <ReprogramarModal r={r} onClose={() => setRepro(false)} onDone={() => { setRepro(false); onChanged(); }} />}
    </>
  );
}

type ItemSalida = { cantidad: number; descripcion: string; numero_inventario: string };

function AutorizacionSalida({ r, form, onChanged }: { r: Row; form: Row; onChanged: () => void }) {
  const { data: me } = useSessionUser();
  const [a, setA] = useState({ nombre: "", cargo: "", telefono: "", correo: "", observaciones: "" });
  const [items, setItems] = useState<ItemSalida[]>(() =>
    (r.reservation_resources ?? []).map((x: Row) => ({
      cantidad: x.cantidad_aprobada ?? x.quantity,
      descripcion: x.resources?.name ?? "",
      numero_inventario: x.resources?.numero_inventario ?? "",
    })));
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  if (!me?.isAdmin) return null;

  const decidir = async (aprobar: boolean) => {
    setBusy(true);
    const { error } = aprobar
      ? await supabase.rpc("autorizar_salida", { _form_id: form.id, _autoriza: a, _items: items })
      : await supabase.rpc("rechazar_salida", { _form_id: form.id, _motivo: motivo.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    void notifyReservationPush({ data: {
      reservationId: r.id,
      title: aprobar ? "Salida de bienes aprobada" : "Salida de bienes rechazada",
      body: aprobar ? `La salida a ${form.destination ?? "destino"} fue autorizada. Ya puedes imprimir el formato VA-SL-FO-010.` : `La salida a ${form.destination ?? "destino"} fue rechazada. ${motivo.trim().slice(0, 80)}`,
    } }).catch(() => {});
    toast.success(aprobar ? "Salida autorizada" : "Salida rechazada");
    onChanged();
  };

  const inp = "border border-input rounded-lg px-2 h-8 bg-background text-foreground text-xs w-full";
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2 text-xs">
      <p className="font-semibold text-sm">Autorización de salida de bienes (etapa 2 · administrador)</p>
      <p className="text-muted-foreground">Dependencia Autorizada: Facultad de Medicina · Dependencia Responsable: Laboratorio de Simulación</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input className={inp} placeholder="Nombre de quien autoriza (ej. Juan Carlos Caro Gil)" value={a.nombre} onChange={(e) => setA({ ...a, nombre: e.target.value })} />
        <Input className={inp} placeholder="Cargo (ej. Técnico Laboratorio)" value={a.cargo} onChange={(e) => setA({ ...a, cargo: e.target.value })} />
        <Input className={inp} placeholder="Teléfono" value={a.telefono} onChange={(e) => setA({ ...a, telefono: e.target.value })} />
        <Input className={inp} placeholder="Correo institucional" value={a.correo} onChange={(e) => setA({ ...a, correo: e.target.value })} />
      </div>
      <p className="font-semibold">Control de inventario: asigna el N° de inventario / serial a cada elemento</p>
      <div className="space-y-1">
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[56px_1fr_120px] gap-1 items-center">
            <Input className={inp} type="number" min={0} value={it.cantidad} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, cantidad: Math.max(0, +e.target.value || 0) } : x))} />
            <Input className={inp} value={it.descripcion} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))} />
            <Input className={inp} placeholder="N° inventario" value={it.numero_inventario} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, numero_inventario: e.target.value } : x))} />
          </div>
        ))}
        {items.length === 0 && <p className="text-muted-foreground">Sin equipos de la reserva; se usará la relación de elementos del docente.</p>}
      </div>
      <Textarea placeholder="Observaciones (opcional)" value={a.observaciones} onChange={(e) => setA({ ...a, observaciones: e.target.value })} />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" disabled={busy || !a.nombre.trim()} onClick={() => decidir(true)}>Aprobar Salida</Button>
        <Input className={`${inp} flex-1 min-w-40`} placeholder="Motivo del rechazo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <Button size="sm" variant="destructive" disabled={busy || !motivo.trim()} onClick={() => decidir(false)}>Rechazar Salida</Button>
      </div>
    </div>
  );
}

function ReprogramarModal({ r, onClose, onDone }: { r: Row; onClose: () => void; onDone: () => void }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [dia, setDia] = useState<Date>(new Date(r.starts_at));
  const [ini, setIni] = useState(() => hora(r.starts_at));
  const [fin, setFin] = useState(() => hora(r.ends_at));
  const [busy, setBusy] = useState(false);
  const ymd = format(dia, "yyyy-MM-dd");
  const iso = (t: string) => new Date(`${ymd}T${t}:00-05:00`).toISOString();

  const aplicar = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("reprogramar_reserva", { _id: r.id, _starts_at: iso(ini), _ends_at: iso(fin) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    window.__lovableEvents?.track?.("project.reservation_status_changed", { status: "REPROGRAMADA" });
    toast.success("Reserva reprogramada");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reprogramar reserva</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{r.activities?.name} · actualmente {fmt(r.starts_at)} – {hora(r.ends_at)}</p>
        <div className="space-y-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start font-normal"><CalendarIcon className="h-4 w-4" />{format(dia, "PPP", { locale: es })}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" locale={es} selected={dia} onSelect={(x) => x && setDia(x)} disabled={(x) => x < hoy} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-medium text-muted-foreground block"><span>Hora inicio</span><RelojHora value={ini} onChange={setIni} /></label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground block"><span>Hora fin (máx. 19:00)</span><RelojHora value={fin} onChange={setFin} /></label>
          </div>
          <p className="text-xs text-muted-foreground">Se valida que el espacio esté libre en el nuevo horario y que no supere las 19:00 hrs.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Volver</Button>
          <Button disabled={busy || fin <= ini} onClick={aplicar}>Confirmar nuevo horario</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
