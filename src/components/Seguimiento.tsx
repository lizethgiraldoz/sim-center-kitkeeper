import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmt, type Row } from "@/lib/app-data";
import { notifyReservationPush } from "@/lib/push.functions";

export const MONTAJE = [
  { v: "PENDIENTE", l: "Pendiente", c: "bg-destructive" },
  { v: "EN_MONTAJE", l: "En montaje", c: "bg-warning" },
  { v: "LISTO", l: "Listo", c: "bg-success" },
  { v: "FALTA_EQUIPO", l: "Falta equipo", c: "bg-orange" },
];
const SALIDA = [{ v: "AUTORIZADA", l: "Autorizada salida" }, { v: "ENTREGADO", l: "Entregado" }, { v: "RETORNADO", l: "Recibido / Retornado" }];

export function Seguimiento({ r, onChanged }: { r: Row; onChanged: () => void }) {
  const set = async (campo: string, valor: string, detalle?: string) => {
    const { error } = await supabase.rpc("actualizar_seguimiento", { _id: r.id, _campo: campo, _valor: valor, ...(detalle ? { _detalle: detalle } : {}) });
    if (error) { toast.error(error.message); return; }
    toast.success("Seguimiento actualizado"); onChanged();
    if (campo === "montaje") {
      const l = MONTAJE.find((m) => m.v === valor)?.l ?? valor;
      void notifyReservationPush({ data: { reservationId: r.id, title: "Cambio en el montaje", body: `${r.activities?.name ?? "Tu reserva"} (${fmt(r.starts_at)}): montaje ${l}${detalle ? ` — falta: ${detalle}` : ""}.` } }).catch(() => {});
    }
  };
  const actual = MONTAJE.find((m) => m.v === r.estado_montaje) ?? MONTAJE[0]!;
  const asistio = r.asistencia === "ASISTIO";
  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-muted/40 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Montaje:</span>
        <span className={`inline-block h-3 w-3 rounded-full ${actual.c}`} aria-hidden />
        {asistio ? <span className="font-semibold text-success">Listo (asistencia registrada)</span> :
        <select className="h-7 rounded border px-1" value={actual.v} onChange={(e) => {
          const v = e.target.value;
          if (v === "FALTA_EQUIPO") { const d = window.prompt("¿Qué equipo falta?"); if (d) set("montaje", v, d); }
          else set("montaje", v);
        }}>{MONTAJE.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select>}
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
