import { useState } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmt, hora, type Row } from "@/lib/app-data";
import { notifyReservationPush } from "@/lib/push.functions";
export const MONTAJE = [
  { v: "PENDIENTE", l: "Pendiente", c: "bg-destructive" },
  { v: "EN_MONTAJE", l: "En montaje", c: "bg-warning" },
  { v: "LISTO", l: "Listo", c: "bg-success" },
  { v: "FALTA_EQUIPO", l: "Falta equipo", c: "bg-orange" },
];
const SALIDA = [
  { v: "AUTORIZADA", l: "Autorizada salida" },
  { v: "ENTREGADO", l: "Entregado" },
  { v: "RETORNADO", l: "Recibido / Retornado" },
];
export function Seguimiento({ r, onChanged }: { r: Row; onChanged: () => void }) {
  const [modalFalta, setModalFalta] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Record<string, number>>({});
  const [textoFalta, setTextoFalta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const insumosPractica: Row[] = (r.reservation_resources ?? []).filter(
    (it: Row) => (it.cantidad_aprobada ?? it.quantity ?? 0) > 0
  );
  const set = async (campo: string, valor: string, detalle?: string) => {
    const { error } = await supabase.rpc("actualizar_seguimiento", {
      _id: r.id,
      _campo: campo,
      _valor: valor,
      ...(detalle ? { _detalle: detalle } : {}),
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Seguimiento actualizado");
    onChanged();
    if (campo === "montaje") {
      const l = MONTAJE.find((m) => m.v === valor)?.l ?? valor;
      void notifyReservationPush({
        data: {
          reservationId: r.id,
          title: "Cambio en el montaje",
          body: `${r.activities?.name ?? "Tu reserva"} (${fmt(r.starts_at)}): montaje ${l}${detalle ? ` — falta: ${detalle}` : ""}.`,
        },
      }).catch(() => {});
    }
    return true;
  };
  const abrirFormularioFalta = (precargarActual = false) => {
    setSeleccionados({});
    setTextoFalta(precargarActual && r.falta_equipo ? r.falta_equipo : "");
    setModalFalta(true);
  };
  const toggleInsumo = (resourceId: string, maxCant: number) => {
    setSeleccionados((prev) => {
      const copia = { ...prev };
      if (copia[resourceId] !== undefined) {
        delete copia[resourceId];
      } else {
        copia[resourceId] = maxCant;
      }
      return copia;
    });
  };
  const cambiarCantFaltante = (resourceId: string, val: number, maxCant: number) => {
    const limpio = Math.max(1, Math.min(maxCant, Math.floor(val) || 1));
    setSeleccionados((prev) => ({ ...prev, [resourceId]: limpio }));
  };
  const guardarFalta = async () => {
    const marcados = insumosPractica
      .filter((it: Row) => seleccionados[it.resource_id] !== undefined)
      .map((it: Row) => {
        const cant = seleccionados[it.resource_id];
        const nombre = it.resources?.name ?? "Insumo";
        return `${cant} × ${nombre}`;
      });
    const partes = [...marcados];
    if (textoFalta.trim()) {
      partes.push(textoFalta.trim());
    }
    const detalleFinal = partes.join(" · ");
    if (!detalleFinal) {
      toast.error("Selecciona al menos un insumo del listado o escribe cuál elemento falta.");
      return;
    }
    setGuardando(true);
    const ok = await set("montaje", "FALTA_EQUIPO", detalleFinal);
    setGuardando(false);
    if (ok) {
      setModalFalta(false);
    }
  };
  const actual = MONTAJE.find((m) => m.v === r.estado_montaje) ?? MONTAJE[0]!;
  const asistio = r.asistencia === "ASISTIO";
  const hayDetalleFalta =
    Object.keys(seleccionados).length > 0 || textoFalta.trim().length > 0;
  const devuelto = r.salida_estado === "RETORNADO";
  const sinDevolver = !devuelto && new Date(r.ends_at).getTime() < Date.now();
  const estadoPrestamo = devuelto
    ? {
        label: "Devuelto",
        dot: "bg-success",
        badge: "bg-success/15 text-success border-success/30",
      }
    : sinDevolver
      ? {
          label: "Sin devolver",
          dot: "bg-destructive",
          badge: "bg-destructive/15 text-destructive border-destructive/30",
        }
      : {
          label: "En préstamo",
          dot: "bg-warning",
          badge: "bg-warning/15 text-warning-foreground border-warning/40",
        };
  const marcarDevuelto = async () => {
    if (r.salida_estado !== "ENTREGADO") {
      await supabase.rpc("actualizar_seguimiento", {
        _id: r.id,
        _campo: "salida",
        _valor: "ENTREGADO",
      });
    }
    await set("salida", "RETORNADO");
  };
  return (
    <>
      {r.leaves_faculty ? (
        <div className="mt-2 space-y-2 rounded-lg border bg-muted/40 p-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Estado del préstamo:</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${estadoPrestamo.badge}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${estadoPrestamo.dot}`} aria-hidden />
                {estadoPrestamo.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {!devuelto ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => void marcarDevuelto()}
                >
                  Marcar como devuelto
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => void set("salida", "ENTREGADO")}
                >
                  Reabrir préstamo
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => abrirFormularioFalta(r.estado_montaje === "FALTA_EQUIPO")}
              >
                Reportar faltante
              </Button>
            </div>
          </div>
          {r.estado_montaje === "FALTA_EQUIPO" && r.falta_equipo && (
            <div className="flex flex-wrap items-center gap-1.5 text-destructive">
              <span className="font-medium">Faltante reportado: {r.falta_equipo}</span>
            </div>
          )}
        </div>
      ) : (
      <div className="mt-2 space-y-2 rounded-lg border bg-muted/40 p-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Montaje:</span>
          <span className={`inline-block h-3 w-3 rounded-full ${actual.c}`} aria-hidden />
          {asistio ? (
            <span className="font-semibold text-success">Listo (asistencia registrada)</span>
          ) : (
            <select
              className="h-7 rounded border bg-background px-1.5 text-foreground"
              value={actual.v}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "FALTA_EQUIPO") {
                  abrirFormularioFalta(r.estado_montaje === "FALTA_EQUIPO");
                } else {
                  void set("montaje", v);
                }
              }}
            >
              {MONTAJE.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.l}
                </option>
              ))}
            </select>
          )}
          {r.estado_montaje === "FALTA_EQUIPO" && (
            <div className="flex flex-wrap items-center gap-1.5">
              {r.falta_equipo && <span className="text-destructive font-medium">Falta: {r.falta_equipo}</span>}
              {!asistio && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => abrirFormularioFalta(true)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Editar faltantes
                </Button>
              )}
            </div>
          )}
        </div>
        {r.leaves_faculty && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-semibold">Salida externa:</span>
            {SALIDA.map((s, i) => {
              const idx = SALIDA.findIndex((x) => x.v === r.salida_estado);
              return (
                <Button
                  key={s.v}
                  size="sm"
                  className="h-7"
                  variant={idx >= i ? "default" : "outline"}
                  disabled={i !== idx + 1}
                  onClick={() => void set("salida", s.v)}
                >
                  {s.l}
                </Button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <span className="font-semibold">Asistencia del docente:</span>
          {r.asistencia === "ASISTIO" ? (
            <span className="text-success font-semibold">Asistió</span>
          ) : (
            <>
              <Button size="sm" className="h-7" variant="outline" onClick={() => void set("asistencia", "ASISTIO")}>
                Asistió
              </Button>
              <Button
                size="sm"
                className="h-7"
                variant="destructive"
                onClick={() => {
                  if (window.confirm("Se registrará la ausencia y se liberará el espacio. ¿Continuar?")) {
                    void set("asistencia", "NO_ASISTIO");
                  }
                }}
              >
                No asistió
              </Button>
            </>
          )}
        </div>
      </div>
      )}
      <Dialog open={modalFalta} onOpenChange={(o) => !o && setModalFalta(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-orange shrink-0" />
              Registro de insumos o equipos faltantes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-0.5">
              <p className="font-semibold text-foreground">
                {r.leaves_faculty ? "Préstamo / Salida externa" : (r.activities?.name ?? "Práctica")}
              </p>
              <p className="text-muted-foreground">
                {r.leaves_faculty
                  ? `Préstamo: ${fmt(r.starts_at)} – ${hora(r.ends_at)}`
                  : `${r.spaces?.name ?? "Sin espacio"} · ${fmt(r.starts_at)} – ${hora(r.ends_at)}`}
              </p>
              <p className="text-muted-foreground">
                {r.leaves_faculty ? "Responsable" : "Docente"}: {r.docente_responsable_nombre ?? r.solicitante_nombre ?? "—"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">
                Insumos y equipos requeridos para esta práctica
              </p>
              {insumosPractica.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Esta reserva no tiene insumos asociados en la solicitud. Escribe abajo los elementos faltantes.
                </p>
              ) : (
                <div className="divide-y rounded-lg border overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto] gap-2 bg-muted px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
                    <span>Marca los elementos que faltan</span>
                    <span>Cant. faltante</span>
                  </div>
                  {insumosPractica.map((it: Row) => {
                    const reqCant = it.cantidad_aprobada ?? it.quantity ?? 1;
                    const marcado = seleccionados[it.resource_id] !== undefined;
                    return (
                      <div
                        key={it.resource_id}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-xs transition-colors ${
                          marcado ? "bg-destructive/10" : "hover:bg-muted/40"
                        }`}
                      >
                        <label className="flex items-start gap-2.5 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => toggleInsumo(it.resource_id, reqCant)}
                            className="mt-0.5 h-4 w-4 rounded border-input accent-primary cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground leading-snug break-words">
                              {it.resources?.name ?? "Recurso sin nombre"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Requerido: {reqCant} unid.
                              {it.resources?.numero_inventario ? ` · Inv: ${it.resources.numero_inventario}` : ""}
                            </p>
                          </div>
                        </label>
                        {marcado && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Input
                              type="number"
                              min={1}
                              max={reqCant}
                              value={seleccionados[it.resource_id]}
                              onChange={(e) => cambiarCantFaltante(it.resource_id, +e.target.value, reqCant)}
                              className="h-7 w-16 text-xs text-center"
                            />
                            <span className="text-[11px] text-muted-foreground">/ {reqCant}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground block">
                Escribe cuáles insumos o equipos faltan (o detalles adicionales)
              </label>
              <Textarea
                rows={3}
                placeholder="Ej. Faltan 2 pares de guantes estériles talla M, cable de ECG de 5 derivaciones..."
                value={textoFalta}
                onChange={(e) => setTextoFalta(e.target.value)}
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Este reporte quedará visible en la pestaña <strong>Faltas e inasistencias</strong> y notificará al docente responsable.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setModalFalta(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={guardarFalta} disabled={!hayDetalleFalta || guardando}>
              {guardando ? "Guardando..." : "Registrar faltante"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}