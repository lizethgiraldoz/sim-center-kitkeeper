import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EstadoBadge } from "@/components/EstadoBadge";
import { useNoLeidos } from "@/lib/unread";
import { DetalleReserva } from "@/components/DetalleReserva";
import { ModalAprobacion } from "@/components/ModalAprobacion";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { RESERVA_SELECT, fmt, hora, useCatalogos, type Row } from "@/lib/app-data";
import { notifyReservationPush } from "@/lib/push.functions";
export const Route = createFileRoute("/_authenticated/solicitudes")({
  head: () => ({ meta: [{ title: "Gestión prácticas en laboratorio · Laboratorio de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});
function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[b.length];
}
function coincideDocente(consulta: string, r: Row): boolean {
  const q = normalizarTexto(consulta);
  if (!q) return true;
  const target = normalizarTexto(
    `${r.docente_responsable_nombre ?? ""} ${r.solicitante_nombre ?? ""}`
  );
  if (!target) return false;
  if (target.includes(q)) return true;
  const qTokens = q.split(" ").filter(Boolean);
  const tWords = target.split(" ").filter(Boolean);
  return qTokens.every((qt) =>
    tWords.some((tw) => {
      if (tw.includes(qt) || (qt.includes(tw) && tw.length >= 3)) return true;
      if (qt.length >= 3 && tw.length >= 3) {
        const dist = levenshtein(qt, tw);
        const sim = 1 - dist / Math.max(qt.length, tw.length);
        return sim >= 0.72;
      }
      return false;
    })
  );
}
function prioridadEstado(status?: string | null): number {
  if (status === "SOLICITADA") return 0;
  if (status === "APROBADA" || status === "EN_CURSO") return 1;
  return 2;
}
function Page() {
  const [filtro, setFiltro] = useState("SOLICITADA");
  const [textoDocente, setTextoDocente] = useState("");
  const [busquedaDocente, setBusquedaDocente] = useState("");
  const q = useQuery({
    queryKey: ["reservas", "practicas-laboratorio"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reservations")
        .select(RESERVA_SELECT)
        .order("starts_at", { ascending: true })
        .order("created_at", { ascending: true });
      return (data ?? []).filter((r: Row) => !r.leaves_faculty);
    },
  });
  const { data: cat } = useCatalogos();
  const noLeidos = useNoLeidos();
  const [ver, setVer] = useState<Row | null>(null);
  const [rechazo, setRechazo] = useState<Row | null>(null);
  const [motivo, setMotivo] = useState("");
  const [reasig, setReasig] = useState<Row | null>(null);
  const [aprobar, setAprobar] = useState<Row | null>(null);
  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p;
    if (error) toast.error(error.message);
    else toast.success(ok);
    q.refetch();
    return !error;
  };
  const rows = useMemo(() => {
    return [...(q.data ?? [])]
      .filter((r: Row) => !r.leaves_faculty)
      .filter((r: Row) => filtro === "TODAS" || r.status === filtro)
      .filter((r: Row) => coincideDocente(busquedaDocente, r))
      .sort((a: Row, b: Row) => {
        const estA = prioridadEstado(a.status);
        const estB = prioridadEstado(b.status);
        if (estA !== estB) return estA - estB;
        const fechaA = new Date(a.starts_at).getTime();
        const fechaB = new Date(b.starts_at).getTime();
        if (fechaA !== fechaB) return fechaA - fechaB;
        const creadaA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const creadaB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (creadaA !== creadaB) return creadaA - creadaB;
        return String(a.id ?? "").localeCompare(String(b.id ?? ""));
      });
  }, [q.data, filtro, busquedaDocente]);
  const ejecutarBusqueda = (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusquedaDocente(textoDocente.trim());
  };
  const limpiarBusqueda = () => {
    setTextoDocente("");
    setBusquedaDocente("");
  };
  return (
    <div>
      <Titulo
        t="Gestión prácticas en laboratorio"
        d="Aprobar prácticas internas bloquea salones y recursos del laboratorio; los préstamos externos se gestionan en su apartado exclusivo"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs value={filtro} onValueChange={setFiltro}>
          <TabsList className="flex-wrap h-auto">
            {["SOLICITADA", "APROBADA", "RECHAZADA", "CANCELADA", "TODAS"].map((s) => (
              <TabsTrigger key={s} value={s}>
                {s === "TODAS" ? "Todas" : s.charAt(0) + s.slice(1).toLowerCase()}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <form onSubmit={ejecutarBusqueda} className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[230px] sm:w-64">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={textoDocente}
              onChange={(e) => {
                const val = e.target.value;
                setTextoDocente(val);
                if (!val.trim()) setBusquedaDocente("");
              }}
              placeholder="Buscar por docente responsable..."
              className="pl-9 pr-8 h-9 bg-background text-sm"
            />
            {textoDocente && (
              <button
                type="button"
                onClick={limpiarBusqueda}
                aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" className="h-9">
            <Search className="h-4 w-4 mr-1.5" />
            Buscar
          </Button>
          {busquedaDocente && (
            <Button type="button" size="sm" variant="outline" className="h-9" onClick={limpiarBusqueda}>
              Ver todas
            </Button>
          )}
        </form>
      </div>
      {busquedaDocente && (
        <p className="text-xs text-muted-foreground mb-3">
          {rows.length === 0
            ? `No se encontraron prácticas del docente "${busquedaDocente}" en esta pestaña.`
            : `Mostrando ${rows.length} práctica(s) para el docente "${busquedaDocente}":`}
        </p>
      )}
      <div className="space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay solicitudes de prácticas en este estado.</p>
        )}
        {rows.map((r: Row) => (
          <Card key={r.id}>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-56">
                <div className="flex flex-wrap items-center gap-2">
                  <EstadoBadge status={r.status} />
                  <strong>{r.activities?.name}</strong>
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.spaces?.name ?? "Espacio por asignar"} · {fmt(r.starts_at)} – {hora(r.ends_at)} · {r.participants} participantes
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.docente_responsable_nombre ?? r.solicitante_nombre ?? "—"} · {r.programa}
                </p>
                {r.notes?.trim() && (
                  <p className="text-xs mt-1 text-foreground">
                    <strong>Observaciones:</strong> {r.notes}
                  </p>
                )}
                {r.status === "CANCELADA" && r.justificacion_cancelacion && (
                  <p className="text-xs mt-1 rounded bg-muted px-2 py-1 text-foreground">
                    <strong>Cancelada por el docente:</strong> {r.justificacion_cancelacion}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setVer(r)}>
                  Ver detalle
                  {(noLeidos[r.id] ?? 0) > 0 && (
                    <span
                      className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
                      aria-label="Mensajes sin leer"
                    >
                      {noLeidos[r.id]}
                    </span>
                  )}
                </Button>
                {r.status === "SOLICITADA" && (
                  <>
                    <Button size="sm" onClick={() => setAprobar(r)}>
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setMotivo("");
                        setRechazo(r);
                      }}
                    >
                      Rechazar
                    </Button>
                  </>
                )}
                {(r.status === "APROBADA" || (r.status === "SOLICITADA" && r.space_id)) && (
                  <Button size="sm" variant="outline" onClick={() => setReasig(r)}>
                    Reasignar espacio o fecha
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={!!rechazo} onOpenChange={(o) => !o && setRechazo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Motivo de la decisión (se notificará al docente)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!motivo.trim()}
              onClick={async () => {
                if (
                  await run(
                    supabase.rpc("rechazar_reserva", { _id: rechazo.id, _reason: motivo.trim() }),
                    "Reserva rechazada"
                  )
                ) {
                  window.__lovableEvents?.track?.("project.reservation_status_changed", { status: "RECHAZADA" });
                  void notifyReservationPush({
                    data: {
                      reservationId: rechazo.id,
                      title: "Reserva rechazada",
                      body: `${rechazo.activities?.name ?? "Tu reserva"} fue rechazada. Motivo: ${motivo.trim().slice(0, 100)}`,
                    },
                  }).catch(() => {});
                  setRechazo(null);
                }
              }}
            >
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {aprobar && (
        <ModalAprobacion
          r={aprobar}
          spaces={cat?.spaces ?? []}
          onClose={() => setAprobar(null)}
          onDone={() => {
            setAprobar(null);
            q.refetch();
          }}
        />
      )}
      {reasig && (
        <ModalAprobacion
          modo="reasignar"
          r={reasig}
          spaces={cat?.spaces ?? []}
          onClose={() => setReasig(null)}
          onDone={() => {
            setReasig(null);
            q.refetch();
          }}
        />
      )}
      {ver && (
        <DetalleReserva
          r={ver}
          open
          onOpenChange={(o) => !o && setVer(null)}
          onChanged={() => q.refetch()}
        />
      )}
    </div>
  );
}