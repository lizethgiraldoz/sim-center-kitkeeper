import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Truck, CheckCircle2, XCircle, Clock, PackageCheck, Search,
  MessageSquare, Printer, AlertTriangle, ArrowRight, Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EstadoBadge } from "@/components/EstadoBadge";
import { ChatReserva } from "@/components/ChatReserva";
import { FormatoSalidaModal } from "@/components/FormatoSalida";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { RESERVA_SELECT, fmt, type Row } from "@/lib/app-data";
import { useNoLeidos } from "@/lib/unread";
import { notifyReservationPush } from "@/lib/push.functions";
export const Route = createFileRoute("/_authenticated/prestamos-externos")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  head: () => ({ meta: [{ title: "Préstamos y salidas externas · Laboratorio de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});
const KIND: Record<string, string> = {
  EQUIPO: "Equipo",
  SIMULADOR: "Simulador",
  INSUMO: "Insumo",
  PAQUETE_QUIRURGICO: "Paquete quirúrgico",
};
const SALIDA_LABEL: Record<string, string> = {
  PENDIENTE_AUTORIZACION_SALIDA: "Pendiente de aprobación",
  SALIDA_APROBADA: "Autorizado",
  SALIDA_RECHAZADA: "Rechazado",
};
function formatearIntervalo(ms: number): string {
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  const dias = Math.floor(mins / (60 * 24));
  const horas = Math.floor((mins % (60 * 24)) / 60);
  const remMin = mins % 60;
  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias} d`);
  if (horas > 0) partes.push(`${horas} h`);
  if (dias === 0 && remMin > 0) partes.push(`${remMin} min`);
  return partes.length ? partes.join(" ") : "menos de 1 min";
}
function infoTemporal(inicioIso?: string | null, finIso?: string | null, salidaEstado?: string | null) {
  if (!inicioIso || !finIso) return { duracion: "—", estado: "Sin fechas definidas", tono: "muted" as const };
  const ini = new Date(inicioIso).getTime();
  const fin = new Date(finIso).getTime();
  const ahora = Date.now();
  const duracion = formatearIntervalo(Math.max(0, fin - ini));
  if (salidaEstado === "RETORNADO") {
    return { duracion, estado: "Devuelto al laboratorio", tono: "ok" as const };
  }
  if (ahora < ini) {
    return { duracion, estado: `Inicia en ${formatearIntervalo(ini - ahora)}`, tono: "info" as const };
  }
  if (ahora <= fin) {
    return { duracion, estado: `En uso · Devuelven en ${formatearIntervalo(fin - ahora)}`, tono: "warn" as const };
  }
  return { duracion, estado: `Plazo vencido hace ${formatearIntervalo(ahora - fin)}`, tono: "danger" as const };
}
function getForm(r: Row) {
  return Array.isArray(r?.external_borrow_forms) ? r.external_borrow_forms[0] : r?.external_borrow_forms;
}
function Page() {
  const { id: selectedIdFromUrl } = Route.useSearch();
  const noLeidos = useNoLeidos();
  const [tabPrincipal, setTabPrincipal] = useState("solicitudes");
  const [filtroSol, setFiltroSol] = useState("PENDIENTES");
  const [busquedaInv, setBusquedaInv] = useState("");
  const [filtroInv, setFiltroInv] = useState<"TODOS" | "LIBRES" | "PRESTADOS" | "EXTERNOS">("TODOS");
  const [gestionar, setGestionar] = useState<Row | null>(null);
  const [imprimir, setImprimir] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ["prestamos-externos-data"],
    queryFn: async () => {
      const [resExternas, resActivas, rec] = await Promise.all([
        supabase
          .from("reservations")
          .select(RESERVA_SELECT)
          .eq("leaves_faculty", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("reservations")
          .select(RESERVA_SELECT)
          .in("status", ["APROBADA", "EN_CURSO"]),
        supabase
          .from("resources")
          .select("*, resource_categories(name, kind)")
          .order("name"),
      ]);
      return {
        externas: resExternas.data ?? [],
        activas: resActivas.data ?? [],
        recursos: rec.data ?? [],
      };
    },
  });
  useEffect(() => {
    if (!selectedIdFromUrl || !q.data?.externas?.length) return;
    const found = q.data.externas.find((x: Row) => x.id === selectedIdFromUrl);
    if (found) setGestionar(found);
  }, [selectedIdFromUrl, q.data?.externas]);
  const solicitudActiva = useMemo(() => {
    if (!gestionar) return null;
    return (q.data?.externas ?? []).find((x: Row) => x.id === gestionar.id) ?? gestionar;
  }, [gestionar, q.data?.externas]);
  const ocupacionPorRecurso = useMemo(() => {
    const mapa: Record<string, { unidades: number; prestamos: Row[] }> = {};
    const ahora = Date.now();
    for (const r of q.data?.activas ?? []) {
      if (r.salida_estado === "RETORNADO") continue;
      const form = getForm(r);
      const ini = form?.departure_at ?? r.starts_at;
      const fin = form?.return_at ?? r.ends_at;
      const finMs = new Date(fin).getTime();
      const sigueAfuera = r.leaves_faculty && r.salida_estado !== "RETORNADO";
      if (finMs < ahora && !sigueAfuera) continue;
      for (const rr of r.reservation_resources ?? []) {
        const rid = rr.resource_id ?? rr.resources?.id;
        if (!rid) continue;
        const cant = rr.cantidad_aprobada ?? rr.quantity ?? 0;
        if (cant <= 0) continue;
        if (!mapa[rid]) mapa[rid] = { unidades: 0, prestamos: [] };
        mapa[rid].unidades += cant;
        mapa[rid].prestamos.push({
          reservation: r,
          form,
          cantidad: cant,
          inicio: ini,
          fin,
          esExterna: !!r.leaves_faculty,
          quien: form?.responsible_name || r.docente_responsable_nombre || r.solicitante_nombre || "Docente sin nombre",
          destino: form?.destination || r.spaces?.name || "Laboratorio interno",
        });
      }
    }
    return mapa;
  }, [q.data?.activas]);
  const externasFiltradas = useMemo(() => {
    return (q.data?.externas ?? []).filter((r: Row) => {
      const form = getForm(r);
      const pendiente = r.status === "SOLICITADA" || form?.estado === "PENDIENTE_AUTORIZACION_SALIDA";
      const aprobada = r.status === "APROBADA" && form?.estado !== "SALIDA_RECHAZADA" && r.salida_estado !== "RETORNADO";
      const historial = r.status === "RECHAZADA" || r.status === "CANCELADA" || form?.estado === "SALIDA_RECHAZADA" || r.salida_estado === "RETORNADO";
      if (filtroSol === "PENDIENTES") return pendiente;
      if (filtroSol === "ACTIVOS") return aprobada;
      if (filtroSol === "HISTORIAL") return historial;
      return true;
    });
  }, [q.data?.externas, filtroSol]);
  const recursosFiltrados = useMemo(() => {
    const term = busquedaInv.trim().toLowerCase();
    return (q.data?.recursos ?? []).filter((rec: Row) => {
      const oc = ocupacionPorRecurso[rec.id];
      const ocupados = oc?.unidades ?? 0;
      const bloqueado = rec.status !== "DISPONIBLE";
      const libres = bloqueado ? 0 : Math.max(0, rec.quantity_total - rec.maintenance_quantity - rec.out_of_service_quantity - ocupados);
      if (filtroInv === "LIBRES" && libres <= 0) return false;
      if (filtroInv === "PRESTADOS" && ocupados <= 0) return false;
      if (filtroInv === "EXTERNOS" && !rec.allows_external_exit) return false;
      if (!term) return true;
      return (
        (rec.name ?? "").toLowerCase().includes(term) ||
        (rec.numero_inventario ?? "").toLowerCase().includes(term) ||
        (rec.code ?? "").toLowerCase().includes(term)
      );
    });
  }, [q.data?.recursos, ocupacionPorRecurso, busquedaInv, filtroInv]);
  const totalPendientes = (q.data?.externas ?? []).filter((r: Row) => {
    const f = getForm(r);
    return r.status === "SOLICITADA" || f?.estado === "PENDIENTE_AUTORIZACION_SALIDA";
  }).length;
  const totalEnPrestamo = (q.data?.externas ?? []).filter((r: Row) => {
    const f = getForm(r);
    return r.status === "APROBADA" && f?.estado !== "SALIDA_RECHAZADA" && r.salida_estado !== "RETORNADO";
  }).length;
  return (
    <div>
      <Titulo
        t="Préstamos y salidas externas"
        d="Evaluación exclusiva de salidas de bienes (VA-SL-FO-010), disponibilidad de equipos en tiempo real y comunicación directa con el docente"
      />
      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Pendientes por aprobar</p>
              <p className="text-2xl font-bold text-primary">{totalPendientes}</p>
            </div>
            <Clock className="h-7 w-7 text-primary/70" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Préstamos externos activos</p>
              <p className="text-2xl font-bold text-foreground">{totalEnPrestamo}</p>
            </div>
            <Truck className="h-7 w-7 text-chart-3" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Equipos habilitados para salida</p>
              <p className="text-2xl font-bold text-foreground">
                {(q.data?.recursos ?? []).filter((x: Row) => x.allows_external_exit).length}
              </p>
            </div>
            <Boxes className="h-7 w-7 text-success" />
          </CardContent>
        </Card>
      </div>
      <Tabs value={tabPrincipal} onValueChange={setTabPrincipal}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="solicitudes">
            Solicitudes de préstamo ({totalPendientes} pendientes)
          </TabsTrigger>
          <TabsTrigger value="inventario">
            Inventario disponible vs. prestado
          </TabsTrigger>
        </TabsList>
        <TabsContent value="solicitudes" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "PENDIENTES", label: "Pendientes de decisión" },
              { id: "ACTIVOS", label: "Aprobados / En préstamo" },
              { id: "HISTORIAL", label: "Devueltos / Rechazados" },
              { id: "TODAS", label: "Todas" },
            ].map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={filtroSol === f.id ? "default" : "outline"}
                onClick={() => setFiltroSol(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          {externasFiltradas.length === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No hay solicitudes de préstamo externo en esta categoría.
              </CardContent>
            </Card>
          )}
          <div className="space-y-3">
            {externasFiltradas.map((r: Row) => {
              const form = getForm(r);
              const ini = form?.departure_at ?? r.starts_at;
              const fin = form?.return_at ?? r.ends_at;
              const temp = infoTemporal(ini, fin, r.salida_estado);
              const pendiente = r.status === "SOLICITADA" || form?.estado === "PENDIENTE_AUTORIZACION_SALIDA";
              const recs = r.reservation_resources ?? [];
              return (
                <Card key={r.id} className={pendiente ? "border-primary/50" : ""}>
                  <CardContent className="p-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-64">
                      <div className="flex flex-wrap items-center gap-2">
                        <EstadoBadge status={r.status} />
                        {form?.estado && (
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                            form.estado === "SALIDA_APROBADA"
                              ? "bg-success/20 text-foreground"
                              : form.estado === "SALIDA_RECHAZADA"
                                ? "bg-destructive/15 text-destructive"
                                : "bg-warning/30 text-foreground"
                          }`}>
                            {SALIDA_LABEL[form.estado] ?? form.estado}
                          </span>
                        )}
                        {r.salida_estado && (
                          <span className="rounded border px-2 py-0.5 text-xs font-medium">
                            Equipo: {r.salida_estado}
                          </span>
                        )}
                        <strong className="text-base">{form?.destination ?? "Salida externa"}</strong>
                        <span className="text-xs text-muted-foreground">({r.activities?.name})</span>
                      </div>
                      <p className="text-sm">
                        <strong>Responsable que retira:</strong> {form?.responsible_name ?? r.docente_responsable_nombre ?? "—"}
                        {form?.cargo ? ` · ${form.cargo}` : ""}
                        {form?.responsible_phone ? ` · Tel: ${form.responsible_phone}` : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span><strong>Salida:</strong> {fmt(ini)}</span>
                        <ArrowRight className="h-3 w-3 inline" />
                        <span><strong>Devolución:</strong> {fmt(fin)}</span>
                        <span><strong>Duración:</strong> {temp.duracion}</span>
                        <span className={`font-semibold ${
                          temp.tono === "danger" ? "text-destructive"
                            : temp.tono === "warn" ? "text-orange"
                              : temp.tono === "ok" ? "text-success"
                                : "text-primary"
                        }`}>
                          ({temp.estado})
                        </span>
                      </div>
                      <div className="text-xs pt-1">
                        <strong>Dispositivos solicitados: </strong>
                        {recs.length > 0
                          ? recs.map((x: Row) => `${x.cantidad_aprobada ?? x.quantity} × ${x.resources?.name}`).join(" · ")
                          : (form?.inventory_detail || "Ver detalle en formulario")}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {r.status === "APROBADA" && form?.estado === "SALIDA_APROBADA" && (
                        <Button size="sm" variant="outline" onClick={() => setImprimir(r)}>
                          <Printer className="h-4 w-4 mr-1" />Formato VA-SL-FO-010
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setGestionar(r)}>
                        {pendiente ? "Evaluar y responder" : "Gestionar / Chat"}
                        {(noLeidos[r.id] ?? 0) > 0 && (
                          <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                            {noLeidos[r.id]}
                          </span>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="inventario" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Estado en tiempo real de dispositivos y simuladores</CardTitle>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <div className="relative flex-1 min-w-56">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar por nombre, código o N° de inventario…"
                    value={busquedaInv}
                    onChange={(e) => setBusquedaInv(e.target.value)}
                  />
                </div>
                {[
                  { id: "TODOS", label: "Todos" },
                  { id: "LIBRES", label: "Libres ahora" },
                  { id: "PRESTADOS", label: "En préstamo / en uso" },
                  { id: "EXTERNOS", label: "Permitidos salida externa" },
                ].map((f) => (
                  <Button
                    key={f.id}
                    size="sm"
                    variant={filtroInv === f.id ? "default" : "outline"}
                    onClick={() => setFiltroInv(f.id as typeof filtroInv)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dispositivo / Recurso</TableHead>
                    <TableHead>N° Inventario</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">En uso / Prestados</TableHead>
                    <TableHead className="text-right">Libres ahora</TableHead>
                    <TableHead>Disponibilidad</TableHead>
                    <TableHead>¿Quién lo tiene y cuándo lo devuelven?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recursosFiltrados.map((rec: Row) => {
                    const oc = ocupacionPorRecurso[rec.id];
                    const ocupados = oc?.unidades ?? 0;
                    const bloqueado = rec.status !== "DISPONIBLE";
                    const libres = bloqueado
                      ? 0
                      : Math.max(0, rec.quantity_total - rec.maintenance_quantity - rec.out_of_service_quantity - ocupados);
                    return (
                      <TableRow key={rec.id}>
                        <TableCell>
                          <p className="font-medium">{rec.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {KIND[rec.resource_categories?.kind] ?? rec.resource_categories?.name}
                            {rec.allows_external_exit ? " · Apto salida externa" : " · Solo uso interno"}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs">{rec.numero_inventario || rec.code || "—"}</TableCell>
                        <TableCell className="text-right">{rec.quantity_total}</TableCell>
                        <TableCell className="text-right font-semibold">{ocupados}</TableCell>
                        <TableCell className={`text-right font-bold ${libres === 0 ? "text-destructive" : "text-primary"}`}>
                          {libres}
                        </TableCell>
                        <TableCell>
                          {bloqueado ? (
                            <span className="rounded bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                              {rec.status.replaceAll("_", " ")}
                            </span>
                          ) : libres > 0 ? (
                            <span className="rounded bg-success/20 px-2 py-0.5 text-xs font-medium text-foreground">
                              Libre ({libres} disp.)
                            </span>
                          ) : (
                            <span className="rounded bg-warning/35 px-2 py-0.5 text-xs font-medium text-foreground">
                              Todo en uso / prestado
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-72">
                          {!oc || oc.prestamos.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Sin préstamos ni reservas activas</span>
                          ) : (
                            <div className="space-y-1.5">
                              {oc.prestamos.map((p: Row, idx: number) => {
                                const t = infoTemporal(p.inicio, p.fin, p.reservation.salida_estado);
                                return (
                                  <div key={idx} className="rounded-lg border bg-muted/40 p-2 text-xs">
                                    <div className="flex flex-wrap items-center justify-between gap-1">
                                      <strong>{p.quien} ({p.cantidad} und.)</strong>
                                      <span className={`font-semibold ${t.tono === "danger" ? "text-destructive" : "text-primary"}`}>
                                        {t.estado}
                                      </span>
                                    </div>
                                    <p className="text-muted-foreground">
                                      {p.esExterna ? `Salida externa: ${p.destino}` : `Sala: ${p.destino}`} · Devuelve: {fmt(p.fin)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {solicitudActiva && (
        <ModalGestionPrestamoExterno
          r={solicitudActiva}
          recursos={q.data?.recursos ?? []}
          ocupacionPorRecurso={ocupacionPorRecurso}
          onClose={() => setGestionar(null)}
          onChanged={() => q.refetch()}
          onPrint={() => setImprimir(solicitudActiva)}
        />
      )}
      {imprimir && <FormatoSalidaModal r={imprimir} onClose={() => setImprimir(null)} />}
    </div>
  );
}
type ItemSalida = { cantidad: number; descripcion: string; numero_inventario: string };
function ModalGestionPrestamoExterno({
  r,
  recursos,
  ocupacionPorRecurso,
  onClose,
  onChanged,
  onPrint,
}: {
  r: Row;
  recursos: Row[];
  ocupacionPorRecurso: Record<string, { unidades: number; prestamos: Row[] }>;
  onClose: () => void;
  onChanged: () => void;
  onPrint: () => void;
}) {
  const form = getForm(r);
  const ini = form?.departure_at ?? r.starts_at;
  const fin = form?.return_at ?? r.ends_at;
  const temp = infoTemporal(ini, fin, r.salida_estado);
  const pendiente = r.status === "SOLICITADA" || form?.estado === "PENDIENTE_AUTORIZACION_SALIDA";
  const [autoriza, setAutoriza] = useState({
    nombre: form?.autoriza_nombre ?? "",
    cargo: form?.autoriza_cargo ?? "",
    telefono: form?.autoriza_telefono ?? "",
    correo: form?.autoriza_correo ?? "",
    observaciones: form?.observaciones ?? "",
  });
  const [items, setItems] = useState<ItemSalida[]>(() => {
    if (Array.isArray(form?.items) && form.items.length > 0) return form.items;
    const deReserva = (r.reservation_resources ?? []).map((x: Row) => ({
      cantidad: x.cantidad_aprobada ?? x.quantity ?? 1,
      descripcion: x.resources?.name ?? "",
      numero_inventario: x.resources?.numero_inventario ?? "",
    }));
    if (deReserva.length > 0) return deReserva;
    if (form?.inventory_detail?.trim()) {
      return form.inventory_detail
        .split("\n")
        .filter((l: string) => l.trim())
        .map((l: string) => ({ cantidad: 1, descripcion: l.trim(), numero_inventario: "" }));
    }
    return [];
  });
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [respuestaRapida, setRespuestaRapida] = useState("");
  const [busy, setBusy] = useState(false);
  const verificacionStock = useMemo(() => {
    return (r.reservation_resources ?? []).map((rr: Row) => {
      const rid = rr.resource_id ?? rr.resources?.id;
      const rec = recursos.find((x: Row) => x.id === rid);
      const sol = rr.cantidad_aprobada ?? rr.quantity ?? 0;
      const oc = rid ? ocupacionPorRecurso[rid] : undefined;
      const ocupadosOtros = (oc?.prestamos ?? [])
        .filter((p: Row) => p.reservation.id !== r.id)
        .reduce((acc: number, p: Row) => acc + p.cantidad, 0);
      const total = rec?.quantity_total ?? 0;
      const mant = (rec?.maintenance_quantity ?? 0) + (rec?.out_of_service_quantity ?? 0);
      const disponibles = rec?.status !== "DISPONIBLE" ? 0 : Math.max(0, total - mant - ocupadosOtros);
      return {
        nombre: rr.resources?.name ?? "Equipo",
        solicitado: sol,
        disponibles,
        ok: sol <= disponibles,
        ocupantes: (oc?.prestamos ?? []).filter((p: Row) => p.reservation.id !== r.id),
      };
    });
  }, [r, recursos, ocupacionPorRecurso]);
  const aprobar = async () => {
    if (!autoriza.nombre.trim()) {
      toast.error("Ingresa el nombre de quien autoriza la salida en el laboratorio.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("aprobar_prestamo_externo", {
      _reservation_id: r.id,
      _form_id: form?.id,
      _autoriza: autoriza,
      _items: items,
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    if (respuestaRapida.trim()) {
      await supabase.from("reservation_messages").insert({
        reservation_id: r.id,
        mensaje: respuestaRapida.trim(),
      });
    }
    setBusy(false);
    void notifyReservationPush({
      data: {
        reservationId: r.id,
        title: "Préstamo y salida externa aprobados",
        body: `Tu salida a ${form?.destination ?? "destino"} fue autorizada. Ya puedes descargar el formato VA-SL-FO-010.`,
      },
    }).catch(() => {});
    toast.success("Préstamo externo aprobado y autorizado (VA-SL-FO-010)");
    onChanged();
  };
  const rechazar = async () => {
    if (!motivoRechazo.trim()) {
      toast.error("Escribe el motivo del rechazo para el docente.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("rechazar_prestamo_externo", {
      _reservation_id: r.id,
      _form_id: form?.id ?? null,
      _motivo: motivoRechazo.trim(),
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    await supabase.from("reservation_messages").insert({
      reservation_id: r.id,
      mensaje: `Solicitud de préstamo externo rechazada: ${motivoRechazo.trim()}`,
    });
    setBusy(false);
    void notifyReservationPush({
      data: {
        reservationId: r.id,
        title: "Préstamo externo rechazado",
        body: `Motivo: ${motivoRechazo.trim().slice(0, 120)}`,
      },
    }).catch(() => {});
    toast.success("Solicitud de préstamo rechazada y notificada al docente");
    onChanged();
  };
  const marcarEstadoFisico = async (valor: "ENTREGADO" | "RETORNADO") => {
    setBusy(true);
    const { error } = await supabase.rpc("actualizar_seguimiento", {
      _id: r.id,
      _campo: "salida",
      _valor: valor,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(valor === "ENTREGADO" ? "Entrega física registrada" : "Devolución registrada; equipos liberados");
    onChanged();
  };
  const inp = "border border-input rounded-lg px-2 h-8 bg-background text-foreground text-xs w-full";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Solicitud de Préstamo y Salida Externa
            <EstadoBadge status={r.status} />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border bg-primary/5 p-3 grid gap-2 sm:grid-cols-2 text-xs">
            <div><span className="text-muted-foreground">Docente solicitante:</span> <strong>{r.docente_responsable_nombre ?? r.solicitante_nombre ?? "—"}</strong></div>
            <div><span className="text-muted-foreground">Programa / Facultad:</span> <strong>{r.programa} · {r.facultad_entidad}</strong></div>
            <div><span className="text-muted-foreground">Responsable que retira:</span> <strong>{form?.responsible_name ?? "—"}</strong> ({form?.responsible_document ?? "sin doc."})</div>
            <div><span className="text-muted-foreground">Cargo / Contacto:</span> {form?.cargo ?? "—"} · {form?.responsible_phone ?? r.telefono_contacto ?? "—"}</div>
            <div><span className="text-muted-foreground">Destino:</span> <strong>{form?.destination ?? "—"}</strong></div>
            <div><span className="text-muted-foreground">Vehículo / Transporte:</span> {form?.transport_vehicle ?? "—"}</div>
            <div><span className="text-muted-foreground">Salida programada:</span> <strong>{fmt(ini)}</strong></div>
            <div><span className="text-muted-foreground">Devolución esperada:</span> <strong>{fmt(fin)}</strong> ({temp.duracion})</div>
            <div className="sm:col-span-2"><span className="text-muted-foreground">Motivo / Objeto:</span> {form?.purpose || r.notes || "—"}</div>
            {form?.inventory_detail && (
              <div className="sm:col-span-2"><span className="text-muted-foreground">Relación descrita por el docente:</span> {form.inventory_detail}</div>
            )}
          </div>
          <div className="rounded-xl border p-3 space-y-2">
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Disponibilidad actual de los dispositivos solicitados
            </p>
            {verificacionStock.length === 0 ? (
              <p className="text-xs text-muted-foreground">El docente describió los elementos en texto libre (revisar relación arriba).</p>
            ) : (
              <div className="space-y-1.5">
                {verificacionStock.map((v: Row, idx: number) => (
                  <div key={idx} className={`rounded-lg px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${v.ok ? "bg-success/15" : "bg-destructive/15 text-destructive"}`}>
                    <div className="flex items-center gap-2">
                      {v.ok ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                      <span><strong>{v.solicitado} × {v.nombre}</strong></span>
                    </div>
                    <span>
                      {v.ok
                        ? `Disponible (${v.disponibles} libres ahora)`
                        : `Sin unidades suficientes (${v.disponibles} libres)`}
                    </span>
                    {v.ocupantes.length > 0 && (
                      <div className="w-full pl-6 text-[11px] opacity-90">
                        Actualmente en uso por: {v.ocupantes.map((o: Row) => `${o.quien} (${o.cantidad} und., devuelve ${fmt(o.fin)})`).join(" · ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {pendiente && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2 text-xs">
                <p className="font-semibold text-sm text-primary flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />Aceptar préstamo externo
                </p>
                <div className="grid gap-2">
                  <Input className={inp} placeholder="Nombre de quien autoriza (Lab. Simulación) *" value={autoriza.nombre} onChange={(e) => setAutoriza({ ...autoriza, nombre: e.target.value })} />
                  <Input className={inp} placeholder="Cargo (ej. Técnico Laboratorio)" value={autoriza.cargo} onChange={(e) => setAutoriza({ ...autoriza, cargo: e.target.value })} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input className={inp} placeholder="Teléfono" value={autoriza.telefono} onChange={(e) => setAutoriza({ ...autoriza, telefono: e.target.value })} />
                    <Input className={inp} placeholder="Correo institucional" value={autoriza.correo} onChange={(e) => setAutoriza({ ...autoriza, correo: e.target.value })} />
                  </div>
                </div>
                <p className="font-semibold pt-1">Elementos autorizados y placa de inventario:</p>
                <div className="space-y-1">
                  {items.map((it, i) => (
                    <div key={i} className="grid grid-cols-[48px_1fr_105px] gap-1 items-center">
                      <Input className={inp} type="number" min={1} value={it.cantidad} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, cantidad: Math.max(1, +e.target.value || 1) } : x))} />
                      <Input className={inp} value={it.descripcion} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))} />
                      <Input className={inp} placeholder="N° inventario" value={it.numero_inventario} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, numero_inventario: e.target.value } : x))} />
                    </div>
                  ))}
                </div>
                <Textarea
                  className="text-xs min-h-14"
                  placeholder="Mensaje opcional para el docente al aprobar (ej. Puedes recoger el equipo mañana a las 7:30 a. m.)"
                  value={respuestaRapida}
                  onChange={(e) => setRespuestaRapida(e.target.value)}
                />
                <Button className="w-full" disabled={busy || !autoriza.nombre.trim()} onClick={aprobar}>
                  Aceptar préstamo y autorizar salida
                </Button>
              </div>
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 space-y-2 text-xs flex flex-col justify-between">
                <div className="space-y-2">
                  <p className="font-semibold text-sm text-destructive flex items-center gap-1.5">
                    <XCircle className="h-4 w-4" />No autorizar / Rechazar préstamo
                  </p>
                  <p className="text-muted-foreground">
                    Indica al docente por qué no es posible realizar el préstamo (ej. dispositivo en uso hasta tal fecha o en mantenimiento) y qué alternativa tiene.
                  </p>
                  <Textarea
                    className="text-xs min-h-28"
                    placeholder="Escribe el motivo y respuesta para el docente…"
                    value={motivoRechazo}
                    onChange={(e) => setMotivoRechazo(e.target.value)}
                  />
                </div>
                <Button variant="destructive" className="w-full" disabled={busy || !motivoRechazo.trim()} onClick={rechazar}>
                  Rechazar préstamo y notificar al docente
                </Button>
              </div>
            </div>
          )}
          {r.status === "APROBADA" && form?.estado === "SALIDA_APROBADA" && (
            <div className="rounded-xl border bg-muted/40 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-semibold text-sm">Control de entrega y devolución física</p>
                <p className="text-muted-foreground">Estado actual: <strong>{r.salida_estado ?? "AUTORIZADA"}</strong> · {temp.estado}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.salida_estado !== "ENTREGADO" && r.salida_estado !== "RETORNADO" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => marcarEstadoFisico("ENTREGADO")}>
                    Registrar entrega al docente
                  </Button>
                )}
                {r.salida_estado !== "RETORNADO" && (
                  <Button size="sm" disabled={busy} onClick={() => marcarEstadoFisico("RETORNADO")}>
                    <PackageCheck className="h-4 w-4 mr-1" />Registrar devolución (Retornado)
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={onPrint}>
                  <Printer className="h-4 w-4 mr-1" />Formato VA-SL-FO-010
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />Respuesta y conversación directa con el docente
            </p>
            <ChatReserva reservationId={r.id} teacherId={r.teacher_id} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}