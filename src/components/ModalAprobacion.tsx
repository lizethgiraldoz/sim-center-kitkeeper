import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { es } from "date-fns/locale";
import { GripHorizontal, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { fmt, hora, type Row } from "@/lib/app-data";
import { notifyReservationPush } from "@/lib/push.functions";
const H0 = 7, H1 = 19;
const horas = (iso: string) => {
  const [h, m] = new Date(iso)
    .toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })
    .split(":")
    .map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
};
const diaBogota = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const fmtHoraDec = (hDec: number) => {
  const totalMin = Math.round(hDec * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const parseHoraDec = (hhmm: string) => {
  const [hh, mm] = hhmm.split(":").map(Number);
  return (hh ?? 0) + (mm ?? 0) / 60;
};
export function ModalAprobacion({
  r,
  spaces,
  modo = "aprobar",
  onClose,
  onDone,
}: {
  r: Row;
  spaces: Row[];
  modo?: "aprobar" | "reasignar";
  onClose: () => void;
  onDone: () => void;
}) {
  const esReasignar = modo === "reasignar";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const origDia = new Date(r.starts_at);
  const origYmd = diaBogota(origDia);
  const origS0 = Math.max(H0, Math.min(H1 - 0.25, horas(r.starts_at)));
  const origS1 = Math.max(origS0 + 0.25, Math.min(H1, horas(r.ends_at)));
  const origSpace = r.space_id ?? "";
  const [space, setSpace] = useState<string>(origSpace);
  const [dia, setDia] = useState<Date>(origDia);
  const [s0, setS0] = useState<number>(origS0);
  const [s1, setS1] = useState<number>(origS1);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{ startX: number; origStart: number; origEnd: number; trackWidth: number } | null>(null);
  const spacesRef = useRef(spaces);
  spacesRef.current = spaces;
  const participantsRef = useRef<number>(r.participants ?? 1);
  participantsRef.current = r.participants ?? 1;
  const ymd = diaBogota(dia);
  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.trackWidth <= 0) return;
      const deltaX = ev.clientX - drag.startX;
      const deltaHoursRaw = (deltaX / drag.trackWidth) * (H1 - H0);
      const deltaHours = Math.round(deltaHoursRaw * 4) / 4; // bloques de 15 min
      const dur = drag.origEnd - drag.origStart;
      const newStart = Math.max(H0, Math.min(H1 - dur, drag.origStart + deltaHours));
      const newEnd = Math.min(H1, newStart + dur);
      setS0(newStart);
      setS1(newEnd);
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-space-id]") as HTMLElement | null;
      const hoverSpaceId = el?.dataset.spaceId;
      if (hoverSpaceId) {
        const sp = spacesRef.current.find((x: Row) => x.id === hoverSpaceId);
        if (sp && participantsRef.current <= sp.capacity && sp.status !== "EN_MANTENIMIENTO" && sp.status !== "FUERA_DE_SERVICIO") {
          setSpace(hoverSpaceId);
        }
      }
    };
    const onUp = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);
  const iniciarArrastre = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const track = e.currentTarget.parentElement;
    if (!track) return;
    dragRef.current = {
      startX: e.clientX,
      origStart: s0,
      origEnd: s1,
      trackWidth: track.getBoundingClientRect().width,
    };
    setDragging(true);
  };
  const occ = useQuery({
    queryKey: ["ocupacion", ymd],
    queryFn: async () =>
      (
        await supabase
          .from("reservations")
          .select("id, space_id, starts_at, ends_at, status, activities(name), reservation_resources(resource_id, quantity, resources(name))")
          .in("status", ["APROBADA", "EN_CURSO"])
          .gte("starts_at", new Date(`${ymd}T00:00:00-05:00`).toISOString())
          .lte("starts_at", new Date(`${ymd}T23:59:59-05:00`).toISOString())
      ).data ?? [],
  });
  const cruces = (sid: string) =>
    (occ.data ?? []).filter(
      (x: Row) => x.space_id === sid && x.id !== r.id && horas(x.starts_at) < s1 - 0.001 && horas(x.ends_at) > s0 + 0.001
    );
  const recursosR = new Set((r.reservation_resources ?? []).map((x: Row) => x.resources?.name));
  const compartidos = (occ.data ?? [])
    .filter((x: Row) => x.id !== r.id && horas(x.starts_at) < s1 - 0.001 && horas(x.ends_at) > s0 + 0.001)
    .flatMap((x: Row) =>
      (x.reservation_resources ?? [])
        .filter((y: Row) => recursosR.has(y.resources?.name))
        .map((y: Row) => `${y.quantity} × ${y.resources?.name}`)
    );
  const conflicto = space ? cruces(space).length > 0 : false;
  const espacioSel = spaces.find((s: Row) => s.id === space);
  const aforoInsuficiente = !!espacioSel && r.participants > espacioSel.capacity;
  const horarioInvalido = s1 <= s0 || s0 < H0 || s1 > H1;
  const pct = (h: number) => `${((Math.min(Math.max(h, H0), H1) - H0) / (H1 - H0)) * 100}%`;
  const horarioModificado =
    ymd !== origYmd ||
    Math.round(s0 * 60) !== Math.round(origS0 * 60) ||
    Math.round(s1 * 60) !== Math.round(origS1 * 60);
  const espacioModificado = space !== origSpace;
  const hayCambios = horarioModificado || (esReasignar && espacioModificado);
  const restaurarOriginal = () => {
    setDia(new Date(r.starts_at));
    setS0(origS0);
    setS1(origS1);
    if (esReasignar) setSpace(origSpace);
  };
  const confirmar = async () => {
    setBusy(true);
    const nuevoStartsAt = new Date(`${ymd}T${fmtHoraDec(s0)}:00-05:00`).toISOString();
    const nuevoEndsAt = new Date(`${ymd}T${fmtHoraDec(s1)}:00-05:00`).toISOString();
    if (esReasignar) {
      if (horarioModificado) {
        const { error: errRepro } = await supabase.rpc("reprogramar_reserva", {
          _id: r.id,
          _starts_at: nuevoStartsAt,
          _ends_at: nuevoEndsAt,
        });
        if (errRepro) {
          setBusy(false);
          toast.error(errRepro.message);
          return;
        }
      }
      if (espacioModificado) {
        const { error: errReasig } = await supabase.rpc("reasignar_espacio", {
          _id: r.id,
          _new_space_id: space,
        });
        if (errReasig) {
          setBusy(false);
          toast.error(errReasig.message);
          return;
        }
      }
      const aviso = `Reasignación realizada por administración: de ${r.spaces?.name ?? "Sin espacio"} (${fmt(r.starts_at)} – ${hora(r.ends_at)}) a ${espacioSel?.name ?? "Espacio asignado"} (${fmt(nuevoStartsAt)} – ${hora(nuevoEndsAt)}). Los equipos e insumos se mantienen.`;
      await supabase.from("reservation_messages").insert({
        reservation_id: r.id,
        mensaje: aviso,
      });
      setBusy(false);
      void notifyReservationPush({
        data: {
          reservationId: r.id,
          title: "Reserva reasignada",
          body: `${r.activities?.name ?? "Tu reserva"} fue reasignada a ${espacioSel?.name ?? "nuevo espacio"} para ${fmt(nuevoStartsAt)} – ${hora(nuevoEndsAt)}.`,
        },
      }).catch(() => {});
      toast.success("Espacio y/o fecha reasignados y docente notificado");
      onDone();
      return;
    }
    if (horarioModificado) {
      const { error: errRepro } = await supabase.rpc("reprogramar_reserva", {
        _id: r.id,
        _starts_at: nuevoStartsAt,
        _ends_at: nuevoEndsAt,
      });
      if (errRepro) {
        setBusy(false);
        toast.error(errRepro.message);
        return;
      }
    }
    const { error } = await supabase.rpc("aprobar_reserva_con_espacio", { _id: r.id, _space_id: space });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    if (horarioModificado) {
      const aviso = `Horario ajustado por disponibilidad al aprobar: de ${fmt(r.starts_at)} – ${hora(r.ends_at)} a ${fmt(nuevoStartsAt)} – ${hora(nuevoEndsAt)}${espacioSel ? ` en ${espacioSel.name}` : ""}.`;
      await supabase.from("reservation_messages").insert({
        reservation_id: r.id,
        mensaje: aviso,
      });
    }
    setBusy(false);
    window.__lovableEvents?.track?.("project.reservation_approved", { programa: r.programa ?? "desconocido" });
    void notifyReservationPush({
      data: {
        reservationId: r.id,
        title: horarioModificado ? "Reserva aprobada con ajuste de horario" : "Reserva aprobada",
        body: horarioModificado
          ? `${r.activities?.name ?? "Tu reserva"} fue aprobada para ${fmt(nuevoStartsAt)} – ${hora(nuevoEndsAt)}${espacioSel ? ` (${espacioSel.name})` : ""}.`
          : `${r.activities?.name ?? "Tu reserva"} fue aprobada para ${fmt(nuevoStartsAt)}.`,
      },
    }).catch(() => {});
    toast.success(horarioModificado ? "Aprobación registrada con nuevo horario y aviso al docente" : "Aprobación definitiva registrada");
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{esReasignar ? "Reasignar espacio o fecha" : "Confirmación y verificación de aprobación"}</DialogTitle>
        </DialogHeader>
        <div className="text-sm rounded-xl bg-primary/5 border p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong>{r.activities?.name}</strong> · Actual: {r.spaces?.name ? `${r.spaces.name} · ` : ""}
            {fmt(r.starts_at)} – {hora(r.ends_at)} · {r.participants} participantes · {r.programa}
          </div>
          {hayCambios && (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={restaurarOriginal}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />Restaurar original
            </Button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <Calendar
            mode="single"
            locale={es}
            selected={dia}
            onSelect={(d) => d && setDia(d)}
            disabled={(d) => d < hoy}
            className="p-3 pointer-events-auto rounded-xl border"
          />
          <div className="space-y-3 min-w-0">
            <div className="grid gap-2 sm:grid-cols-[1fr_115px_115px]">
              <label className="text-xs font-medium text-muted-foreground block min-w-0">
                Asignar espacio / laboratorio
                <select
                  className="mt-1 border border-input rounded-lg px-2 h-9 bg-background text-foreground text-sm w-full truncate"
                  value={space}
                  onChange={(e) => setSpace(e.target.value)}
                >
                  <option value="">Seleccione…</option>
                  {spaces.map((s: Row) => {
                    const sinAforo = r.participants > s.capacity;
                    return (
                      <option key={s.id} value={s.id} disabled={sinAforo || s.status === "EN_MANTENIMIENTO" || s.status === "FUERA_DE_SERVICIO"}>
                        {s.name} · cap. {s.capacity}
                        {sinAforo ? ` · AFORO INSUFICIENTE (${s.capacity}/${r.participants})` : ""}
                        {cruces(s.id).length ? " · OCUPADO" : ""}
                        {s.status !== "DISPONIBLE" && s.status !== "RESERVADO" ? ` · ${s.status}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground block">
                Hora inicio
                <Input
                  type="time"
                  min="07:00"
                  max="18:45"
                  className="mt-1 h-9"
                  value={fmtHoraDec(s0)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const v = Math.max(H0, Math.min(H1 - 0.25, parseHoraDec(e.target.value)));
                    const dur = Math.max(0.25, s1 - s0);
                    setS0(v);
                    setS1(Math.min(H1, v + dur));
                  }}
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground block">
                Hora fin
                <Input
                  type="time"
                  min="07:15"
                  max="19:00"
                  className="mt-1 h-9"
                  value={fmtHoraDec(s1)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const v = Math.max(s0 + 0.25, Math.min(H1, parseHoraDec(e.target.value)));
                    setS1(v);
                  }}
                />
              </label>
            </div>
            {hayCambios && (
              <div className="text-xs rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-foreground">
                <strong>{esReasignar ? "Nueva asignación:" : "Nuevo horario asignado:"}</strong>{" "}
                {espacioSel ? `${espacioSel.name} · ` : ""}
                {dia.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} ·{" "}
                <strong>{fmtHoraDec(s0)} – {fmtHoraDec(s1)}</strong>. Los equipos e insumos se mantienen y se notificará al docente.
              </div>
            )}
            {aforoInsuficiente && (
              <p className="text-sm rounded-lg bg-destructive/10 text-destructive px-3 py-2">
                Aforo insuficiente (Capacidad: {espacioSel.capacity} | Solicitados: {r.participants}). Seleccione una subdivisión o aula con mayor capacidad.
              </p>
            )}
            <p className="text-xs font-semibold">Ocupación del {dia.toLocaleDateString("es-CO", { dateStyle: "full" })} (07:00–19:00)</p>
            <div className="space-y-1.5 select-none">
              <div className="relative h-4 ml-28 text-[10px] text-muted-foreground">
                {[7, 9, 11, 13, 15, 17, 19].map((h) => (
                  <span key={h} className="absolute -translate-x-1/2" style={{ left: pct(h) }}>
                    {h}
                  </span>
                ))}
              </div>
              {spaces.map((s: Row) => {
                const rs = (occ.data ?? []).filter((x: Row) => x.space_id === s.id && x.id !== r.id);
                const deshabilitado = r.participants > s.capacity || s.status === "EN_MANTENIMIENTO" || s.status === "FUERA_DE_SERVICIO";
                return (
                  <div
                    key={s.id}
                    data-space-id={s.id}
                    onClick={() => !deshabilitado && setSpace(s.id)}
                    className={`flex items-center gap-2 ${s.id === space ? "font-semibold" : ""} ${deshabilitado ? "opacity-60" : "cursor-pointer"}`}
                  >
                    <span className="w-26 shrink-0 truncate text-xs" title={s.name}>
                      {s.name}
                    </span>
                    <div className={`relative h-7 flex-1 rounded-md bg-success/15 ${s.id === space ? "ring-2 ring-primary" : ""}`}>
                      {rs.map((x: Row) => (
                        <div
                          key={x.id}
                          title={`${x.activities?.name} ${hora(x.starts_at)}–${hora(x.ends_at)}`}
                          className="absolute inset-y-0 rounded-md bg-chart-3 text-[10px] text-primary-foreground px-1 flex items-center truncate"
                          style={{ left: pct(horas(x.starts_at)), width: `calc(${pct(horas(x.ends_at))} - ${pct(horas(x.starts_at))})` }}
                        >
                          {x.activities?.name}
                        </div>
                      ))}
                      {s.id === space && (
                        <div
                          onPointerDown={iniciarArrastre}
                          title="Arrastra hacia los lados para cambiar la hora o hacia arriba/abajo para cambiar de salón"
                          className={`absolute inset-y-0 z-10 rounded-md border-2 border-dashed flex items-center justify-center gap-1 px-1 text-[10px] font-semibold shadow-sm transition-colors ${
                            dragging ? "cursor-grabbing scale-[1.02]" : "cursor-grab"
                          } ${
                            conflicto
                              ? "border-destructive bg-destructive/25 text-destructive"
                              : "border-primary bg-primary/25 text-primary"
                          }`}
                          style={{ left: pct(s0), width: `calc(${pct(s1)} - ${pct(s0)})` }}
                        >
                          <GripHorizontal className="h-3 w-3 shrink-0" />
                          <span className="truncate">{fmtHoraDec(s0)}–{fmtHoraDec(s1)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">
                Verde: libre · Azul: reservado · <strong>Recuadro punteado:</strong> arrástralo horizontalmente para mover la hora o haz clic en otro salón libre.
              </p>
            </div>
            {conflicto && (
              <p className="text-sm rounded-lg bg-destructive/10 text-destructive px-3 py-2">
                Cruce de horario en el espacio seleccionado. Arrastra el recuadro punteado a una franja libre o elige otro espacio.
              </p>
            )}
            {compartidos.length > 0 && (
              <p className="text-xs rounded-lg bg-warning/30 px-3 py-2">
                Recursos también reservados en ese horario: {[...new Set(compartidos)].join(", ")}. El sistema verificará que alcance el inventario.
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {esReasignar ? "Cancelar" : "Cancelar / Volver a revisión"}
          </Button>
          <Button
            disabled={!space || conflicto || aforoInsuficiente || horarioInvalido || (esReasignar && !hayCambios) || busy}
            onClick={confirmar}
          >
            {esReasignar
              ? "Confirmar reasignación"
              : horarioModificado
                ? "Confirmar aprobación con nuevo horario"
                : "Confirmar aprobación definitiva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}