import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { fmt, hora, type Row } from "@/lib/app-data";
import { notifyReservationPush } from "@/lib/push.functions";

const H0 = 7, H1 = 19;
const horas = (iso: string) => {
  const [h, m] = new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).split(":").map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
};
const diaBogota = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

export function ModalAprobacion({ r, spaces, onClose, onDone }: { r: Row; spaces: Row[]; onClose: () => void; onDone: () => void }) {
  const [space, setSpace] = useState<string>(r.space_id ?? "");
  const [dia, setDia] = useState<Date>(new Date(r.starts_at));
  const [busy, setBusy] = useState(false);
  const ymd = diaBogota(dia);

  const occ = useQuery({
    queryKey: ["ocupacion", ymd],
    queryFn: async () => (await supabase.from("reservations")
      .select("id, space_id, starts_at, ends_at, status, activities(name), reservation_resources(resource_id, quantity, resources(name))")
      .in("status", ["APROBADA", "EN_CURSO"])
      .gte("starts_at", new Date(`${ymd}T00:00:00-05:00`).toISOString())
      .lte("starts_at", new Date(`${ymd}T23:59:59-05:00`).toISOString())).data ?? [],
  });

  const mismaFecha = diaBogota(new Date(r.starts_at)) === ymd;
  const s0 = horas(r.starts_at), s1 = horas(r.ends_at);
  const cruces = (sid: string) => (occ.data ?? []).filter((x: Row) => x.space_id === sid && x.id !== r.id && mismaFecha && horas(x.starts_at) < s1 && horas(x.ends_at) > s0);
  const recursosR = new Set((r.reservation_resources ?? []).map((x: Row) => x.resources?.name));
  const compartidos = mismaFecha ? (occ.data ?? []).filter((x: Row) => horas(x.starts_at) < s1 && horas(x.ends_at) > s0)
    .flatMap((x: Row) => (x.reservation_resources ?? []).filter((y: Row) => recursosR.has(y.resources?.name)).map((y: Row) => `${y.quantity} × ${y.resources?.name}`)) : [];
  const conflicto = space ? cruces(space).length > 0 : false;
  const pct = (h: number) => `${((Math.min(Math.max(h, H0), H1) - H0) / (H1 - H0)) * 100}%`;

  const confirmar = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("aprobar_reserva_con_espacio", { _id: r.id, _space_id: space });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    window.__lovableEvents?.track?.("project.reservation_approved", { programa: r.programa ?? "desconocido" });
    void notifyReservationPush({ data: { reservationId: r.id, title: "Reserva aprobada", body: `${r.activities?.name ?? "Tu reserva"} fue aprobada para ${fmt(r.starts_at)}.` } }).catch(() => {});
    toast.success("Aprobación definitiva registrada");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-auto">
        <DialogHeader><DialogTitle>Confirmación y verificación de aprobación</DialogTitle></DialogHeader>
        <div className="text-sm rounded-xl bg-primary/5 border p-3">
          <strong>{r.activities?.name}</strong> · {fmt(r.starts_at)} – {hora(r.ends_at)} · {r.participants} participantes · {r.programa}
        </div>
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <Calendar mode="single" locale={es} selected={dia} onSelect={(d) => d && setDia(d)} className="p-3 pointer-events-auto rounded-xl border" />
          <div className="space-y-3 min-w-0">
            <label className="text-xs font-medium text-muted-foreground block">Asignar espacio / laboratorio
              <select className="mt-1 border border-input rounded-lg px-2 h-9 bg-background text-foreground text-sm w-full" value={space} onChange={(e) => setSpace(e.target.value)}>
                <option value="">Seleccione…</option>
                {spaces.map((s: Row) => (
                  <option key={s.id} value={s.id} disabled={s.status === "EN_MANTENIMIENTO" || s.status === "FUERA_DE_SERVICIO"}>
                    {s.name} · cap. {s.capacity}{cruces(s.id).length ? " · OCUPADO" : ""}{s.status !== "DISPONIBLE" && s.status !== "RESERVADO" ? ` · ${s.status}` : ""}
                  </option>))}
              </select>
            </label>
            <p className="text-xs font-semibold">Ocupación del {dia.toLocaleDateString("es-CO", { dateStyle: "full" })} (07:00–19:00)</p>
            <div className="space-y-1.5">
              <div className="relative h-4 ml-28 text-[10px] text-muted-foreground">
                {[7, 9, 11, 13, 15, 17, 19].map((h) => <span key={h} className="absolute -translate-x-1/2" style={{ left: pct(h) }}>{h}</span>)}
              </div>
              {spaces.map((s: Row) => {
                const rs = (occ.data ?? []).filter((x: Row) => x.space_id === s.id);
                return (
                  <div key={s.id} className={`flex items-center gap-2 ${s.id === space ? "font-semibold" : ""}`}>
                    <span className="w-26 shrink-0 truncate text-xs" title={s.name}>{s.name}</span>
                    <div className={`relative h-6 flex-1 rounded-md bg-success/15 ${s.id === space ? "ring-2 ring-primary" : ""}`}>
                      {rs.map((x: Row) => (
                        <div key={x.id} title={`${x.activities?.name} ${hora(x.starts_at)}–${hora(x.ends_at)}`}
                          className="absolute inset-y-0 rounded-md bg-chart-3 text-[10px] text-primary-foreground px-1 truncate"
                          style={{ left: pct(horas(x.starts_at)), width: `calc(${pct(horas(x.ends_at))} - ${pct(horas(x.starts_at))})` }}>{x.activities?.name}</div>
                      ))}
                      {mismaFecha && s.id === space && (
                        <div className={`absolute inset-y-0 rounded-md border-2 border-dashed ${conflicto ? "border-destructive bg-destructive/20" : "border-primary bg-primary/20"}`}
                          style={{ left: pct(s0), width: `calc(${pct(s1)} - ${pct(s0)})` }} />
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">Verde: libre · Azul: reservado · Recuadro punteado: esta solicitud.</p>
            </div>
            {!mismaFecha && <p className="text-xs text-muted-foreground">Está viendo otra fecha. Vuelva al día de la solicitud para verificar cruces.</p>}
            {conflicto && <p className="text-sm rounded-lg bg-destructive/10 text-destructive px-3 py-2">Cruce de horario en el espacio seleccionado. Elija otro espacio.</p>}
            {compartidos.length > 0 && <p className="text-xs rounded-lg bg-warning/30 px-3 py-2">Recursos también reservados en ese horario: {[...new Set(compartidos)].join(", ")}. El sistema verificará que alcance el inventario.</p>}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar / Volver a revisión</Button>
          <Button disabled={!space || conflicto || busy} onClick={confirmar}>Confirmar aprobación definitiva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
