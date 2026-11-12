import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, ClipboardList, Plus, Trash2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RelojHora } from "@/components/RelojHora";
import logo from "@/assets/logo-udea.png.asset.json";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
type Item = { resource_id: string; detalle: string; cantidad: number; std: number };
type PrestamoItem = {
  resource_id: string | null;
  descripcion: string;
  cantidad: number;
  numero_inventario: string;
  esOtro?: boolean;
};
export const FACULTADES: Record<string, string[]> = {
  "Facultad de Medicina": ["Medicina", "Instrumentación Quirúrgica", "Tecnologías"],
  "Facultad de Enfermería": ["Enfermería"],
};
export const NOTA_30 = "Nota: Para aulas móviles o equipos, el docente responsable debe estar media hora antes de la práctica.";
const KIND: Record<string, string> = {
  EQUIPO: "Equipo",
  SIMULADOR: "Simulador",
  INSUMO: "Insumo",
  PAQUETE_QUIRURGICO: "Paquete quirúrgico",
};
const sel = "border border-input rounded-lg px-2 h-9 bg-background text-foreground text-sm w-full shadow-sm";
const L = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <label className="space-y-1 text-xs font-medium text-muted-foreground block"><span>{t}</span>{children}</label>
);
const EXT0 = {
  destination: "",
  responsible_name: "",
  responsible_document: "",
  responsible_phone: "",
  cargo: "",
  correo_institucional: "",
  transport_vehicle: "",
  inventory_detail: "",
  purpose: "",
};
export function FormularioReserva({ activities, onDone }: { spaces?: Row[]; activities: Row[]; onDone: (msg: string) => void }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const manana = new Date(Date.now() + 86400000);
  const [h, setH] = useState({
    facultad_entidad: "Facultad de Medicina", programa: "Medicina", semestre: "13", participants: 20, telefono_contacto: "",
    solicitante_nombre: "", solicitante_documento: "", docente_responsable_nombre: "", docente_responsable_documento: "",
  });
  const [d, setD] = useState({ activity: "", date: manana, start: "08:00", end: "12:00", notes: "" });
  const [salida, setSalida] = useState(false);
  const [modo, setModo] = useState<"NO" | "MISMO" | "DISTINTO">("NO");
  const [semanas, setSemanas] = useState(4);
  const [extras, setExtras] = useState<{ fecha: string; inicio: string; fin: string }[]>([]);
  const [ext, setExt] = useState(EXT0);
  const [salidaDate, setSalidaDate] = useState<Date>(manana);
  const [salidaTime, setSalidaTime] = useState("08:00");
  const [retornoDate, setRetornoDate] = useState<Date>(manana);
  const [retornoTime, setRetornoTime] = useState("12:00");
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  // Inventario completo para préstamos externos + opción "Otro"
  const [catalogoInv, setCatalogoInv] = useState<Row[]>([]);
  const [selInv, setSelInv] = useState("");
  const [otroTexto, setOtroTexto] = useState("");
  const [selCant, setSelCant] = useState(1);
  const [prestamoItems, setPrestamoItems] = useState<PrestamoItem[]>([]);
  useEffect(() => {
    supabase
      .from("resources")
      .select("id, name, code, numero_inventario, quantity_total, maintenance_quantity, out_of_service_quantity, status, allows_external_exit, resource_categories(name, kind)")
      .order("name")
      .then(({ data }) => setCatalogoInv(data ?? []));
  }, []);
  useEffect(() => {
    setD((p) => ({ ...p, activity: p.activity || activities.find((a) => a.name.startsWith("Módulo Adultos 1"))?.id || activities[0]?.id || "" }));
  }, [activities]);
  useEffect(() => {
    if (!d.activity) return;
    supabase.rpc("formulario_plantilla", { _activity_id: d.activity }).then(({ data }) =>
      setItems((data ?? []).map((x: Row) => ({ resource_id: x.resource_id, detalle: x.detalle, cantidad: x.cantidad, std: x.cantidad }))));
  }, [d.activity]);
  const ymd = format(d.date, "yyyy-MM-dd");
  const iso = (t: string) => new Date(`${ymd}T${t}:00-05:00`).toISOString();
  const [disp, setDisp] = useState<Record<string, number>>({});
  useEffect(() => {
    if (salida || !d.activity || d.end <= d.start) return;
    supabase.rpc("disponibilidad_plantilla", { _activity_id: d.activity, _starts: iso(d.start), _ends: iso(d.end) })
      .then(({ data }) => setDisp(Object.fromEntries((data ?? []).map((x: Row) => [x.resource_id, x.disponible]))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salida, d.activity, ymd, d.start, d.end]);
  const sinStock = !salida
    ? items.filter((i) => i.cantidad > 0 && disp[i.resource_id] !== undefined && i.cantidad > (disp[i.resource_id] ?? 0))
    : [];
  const agregarItemPrestamo = () => {
    setErr("");
    const cant = Math.max(1, Math.floor(Number(selCant) || 1));
    if (!selInv) {
      setErr("Selecciona un elemento del inventario o la opción 'Otro'.");
      return;
    }
    if (selInv === "__OTRO__") {
      if (!otroTexto.trim()) {
        setErr("Escribe el nombre o descripción del insumo o equipo que deseas prestar.");
        return;
      }
      setPrestamoItems((prev) => [
        ...prev,
        { resource_id: null, descripcion: otroTexto.trim(), cantidad: cant, numero_inventario: "", esOtro: true },
      ]);
      setOtroTexto("");
      setSelCant(1);
      return;
    }
    const rec = catalogoInv.find((x: Row) => x.id === selInv);
    if (!rec) return;
    const activos = Math.max(0, (rec.quantity_total ?? 0) - (rec.maintenance_quantity ?? 0) - (rec.out_of_service_quantity ?? 0));
    if (rec.status !== "DISPONIBLE" || activos <= 0) {
      setErr(`El recurso "${rec.name}" no tiene unidades operativas disponibles en este momento.`);
      return;
    }
    setPrestamoItems((prev) => {
      const idx = prev.findIndex((p) => p.resource_id === rec.id);
      if (idx >= 0) {
        return prev.map((p, i) => (i === idx ? { ...p, cantidad: p.cantidad + cant } : p));
      }
      return [
        ...prev,
        {
          resource_id: rec.id,
          descripcion: rec.name,
          cantidad: cant,
          numero_inventario: rec.numero_inventario ?? rec.code ?? "",
        },
      ];
    });
    setSelInv("");
    setSelCant(1);
  };
  const inventarioDetalleTexto = useMemo(() => {
    return prestamoItems
      .map((it) => `${it.cantidad} × ${it.descripcion}${it.numero_inventario ? ` (Inv: ${it.numero_inventario})` : it.esOtro ? " [Otro]" : ""}`)
      .join("\n");
  }, [prestamoItems]);
  const submit = async () => {
    setErr("");
    if (salida) {
      if (!ext.destination.trim() || !ext.responsible_name.trim() || !ext.transport_vehicle.trim()) {
        setErr("Completa destino, persona autorizada a sacar el bien y vehículo / transporte.");
        return;
      }
      if (salidaDate < hoy) {
        setErr("La fecha de salida no puede estar en el pasado.");
        return;
      }
      const depIso = new Date(`${format(salidaDate, "yyyy-MM-dd")}T${salidaTime}:00-05:00`).toISOString();
      const retIso = new Date(`${format(retornoDate, "yyyy-MM-dd")}T${retornoTime}:00-05:00`).toISOString();
      if (new Date(retIso) <= new Date(depIso)) {
        setErr("La fecha y hora de devolución debe ser posterior a la de salida.");
        return;
      }
      if (prestamoItems.length === 0) {
        setErr("Agrega al menos un equipo o insumo del inventario (o selecciona 'Otro' para escribirlo).");
        return;
      }
      const itemsCatalogo = prestamoItems
        .filter((it) => !!it.resource_id)
        .map((it) => ({ resource_id: it.resource_id!, cantidad: it.cantidad }));
      const fPrestamo = {
        facultad_entidad: h.facultad_entidad,
        programa: h.programa,
        semestre: null,
        participants: 1,
        telefono_contacto: ext.responsible_phone || h.telefono_contacto,
        solicitante_nombre: ext.responsible_name,
        solicitante_documento: ext.responsible_document,
        docente_responsable_nombre: ext.responsible_name,
        docente_responsable_documento: ext.responsible_document,
        activity_id: d.activity,
        starts_at: depIso,
        ends_at: retIso,
        notes: d.notes,
        items: itemsCatalogo,
        salida: {
          ...ext,
          inventory_detail: inventarioDetalleTexto,
          departure_at: depIso,
          return_at: retIso,
          accepts_responsibility: true,
        },
      };
      const { error } = await supabase.rpc("crear_solicitud_formulario", { _f: fPrestamo });
      if (error) { setErr(error.message); return; }
      onDone("Solicitud de préstamo y salida externa enviada para autorización del Laboratorio de Simulación.");
      return;
    }
    if (d.date < hoy) { setErr("No se pueden solicitar reservas en fechas pasadas."); return; }
    if (d.end > "19:00") { setErr("El horario solicitado supera el límite operativo permitido (19:00 hrs). Requiere autorización especial."); return; }
    if (sinStock.length) { setErr(`El recurso ${sinStock[0]?.detalle} no tiene unidades disponibles en la fecha seleccionada debido a mantenimiento o fuera de servicio.`); return; }
    const f = {
      ...h,
      activity_id: d.activity,
      starts_at: iso(d.start),
      ends_at: iso(d.end),
      notes: d.notes,
      items: items.map((i) => ({ resource_id: i.resource_id, cantidad: i.cantidad })),
    };
    if (modo === "DISTINTO" && extras.length) {
      for (const x of extras) {
        if (!x.fecha || !x.inicio || !x.fin || x.fin <= x.inicio) { setErr(`Revisa la sesión del ${x.fecha || "(sin fecha)"}: la hora fin debe ser mayor que la de inicio.`); return; }
        if (x.fin > "19:00") { setErr(`La sesión del ${x.fecha} supera el límite de las 19:00.`); return; }
      }
      const sesiones = [{ s: f.starts_at, e: f.ends_at, l: ymd }, ...extras.map((x) => ({ s: new Date(`${x.fecha}T${x.inicio}:00-05:00`).toISOString(), e: new Date(`${x.fecha}T${x.fin}:00-05:00`).toISOString(), l: x.fecha }))];
      let creadas = 0; const errores: string[] = [];
      for (const ses of sesiones) {
        const { error } = await supabase.rpc("crear_solicitud_formulario", { _f: { ...f, starts_at: ses.s, ends_at: ses.e } });
        if (error) errores.push(`${ses.l}: ${error.message}`); else creadas++;
      }
      if (!creadas) { setErr(`No se pudo crear ninguna solicitud. ${errores[0] ?? ""}`); return; }
      onDone(`Se crearon ${creadas} solicitudes.${errores.length ? ` No se crearon: ${errores.join(" · ")}` : ""}`);
      return;
    }
    if (modo === "MISMO" && semanas > 1) {
      const { data, error } = await supabase.rpc("crear_reservas_recurrentes", { _f: f, _semanas: semanas });
      if (error) { setErr(error.message); return; }
      const res = data as { creadas?: number; errores?: string[] } | null;
      const errores = res?.errores ?? [];
      if (!res?.creadas) { setErr(`No se pudo crear ninguna solicitud. ${errores[0] ?? ""}`); return; }
      onDone(`Se crearon ${res.creadas} solicitudes (una por semana).${errores.length ? ` Sin cupo en: ${errores.join(" · ")}` : ""} El administrador asignará el espacio al revisarlas.`);
      return;
    }
    const { error } = await supabase.rpc("crear_solicitud_formulario", { _f: f });
    if (error) { setErr(error.message); return; }
    onDone("Solicitud enviada. El administrador asignará el espacio al revisarla.");
  };
  const E = (k: keyof typeof EXT0, t: string, type = "text", placeholder = "") => (
    <L t={t}><Input type={type} placeholder={placeholder} value={ext[k]} onChange={(e) => setExt({ ...ext, [k]: e.target.value })} /></L>
  );
  return (
    <Card className="rounded-xl shadow-md">
      <CardHeader className="border-b bg-primary/5 rounded-t-xl space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={!salida ? "default" : "outline"}
            onClick={() => { setSalida(false); setErr(""); }}
          >
            <ClipboardList className="h-4 w-4 mr-1.5" />Práctica en laboratorio (F-CS-01)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={salida ? "default" : "outline"}
            onClick={() => { setSalida(true); setErr(""); }}
          >
            <Truck className="h-4 w-4 mr-1.5" />Préstamo y salida externa (VA-SL-FO-010)
          </Button>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Universidad de Antioquia · Laboratorio de Simulación</p>
            <CardTitle className="text-primary">
              {salida ? "Solicitud de préstamo y salida externa" : "Solicitud de reserva"}
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {salida ? <>Código: VA-SL-FO-010<br />Versión: 01</> : <>Código: F-CS-01<br />Versión: 01</>}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        {salida ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <L t="Facultad">
                <select
                  className={sel}
                  value={h.facultad_entidad}
                  onChange={(e) => setH({ ...h, facultad_entidad: e.target.value, programa: FACULTADES[e.target.value]?.[0] ?? "" })}
                >
                  {Object.keys(FACULTADES).map((f) => <option key={f}>{f}</option>)}
                </select>
              </L>
              <L t="Programa">
                <select className={sel} value={h.programa} onChange={(e) => setH({ ...h, programa: e.target.value })}>
                  {(FACULTADES[h.facultad_entidad] ?? []).map((p) => <option key={p}>{p}</option>)}
                </select>
              </L>
              {E("responsible_name", "Persona autorizada a sacar el bien *", "text", "Nombre completo del docente o responsable")}
              {E("responsible_document", "Documento del responsable", "text", "Cédula")}
              {E("cargo", "Cargo", "text", "Ej. Docente / Coordinador")}
              {E("responsible_phone", "Teléfono de contacto", "text", "Celular o extensión")}
              {E("correo_institucional", "Correo electrónico institucional", "email", "usuario@udea.edu.co")}
              {E("destination", "Lugar de destino *", "text", "Ej. Parque de la Vida, Hospital, Brigada")}
              {E("transport_vehicle", "Vehículo / transporte *", "text", "Ej. Vehículo institucional / particular")}
              <div className="sm:col-span-2 md:col-span-3">
                {E("purpose", "Destino u objeto de la salida (motivo)", "text", "Ej. Taller extramural de reanimación básica")}
              </div>
            </div>
            <h3 className="text-sm font-semibold border-b pb-1 text-primary">Fechas y horarios de salida y devolución</h3>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <L t="Fecha de salida *">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="h-4 w-4" />{format(salidaDate, "PPP", { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={es}
                      selected={salidaDate}
                      onSelect={(x) => {
                        if (!x) return;
                        setSalidaDate(x);
                        if (x > retornoDate) setRetornoDate(x);
                      }}
                      disabled={(x) => x < hoy}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </L>
              <L t="Hora de salida *">
                <RelojHora value={salidaTime} onChange={setSalidaTime} />
              </L>
              <L t="Fecha estimada de devolución *">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="h-4 w-4" />{format(retornoDate, "PPP", { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={es}
                      selected={retornoDate}
                      onSelect={(x) => x && setRetornoDate(x)}
                      disabled={(x) => x < salidaDate}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </L>
              <L t="Hora estimada de devolución *">
                <RelojHora value={retornoTime} onChange={setRetornoTime} />
              </L>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div>
                <p className="font-semibold text-sm text-primary">Equipos e insumos a prestar o trasladar</p>
                <p className="text-xs text-muted-foreground">
                  Consulta el inventario completo del laboratorio y agrega los elementos que necesitas. Si no encuentras alguno, elige <strong>&quot;Otro&quot;</strong> para escribirlo.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_92px_auto] items-end">
                <L t="Inventario del laboratorio">
                  <select className={sel} value={selInv} onChange={(e) => setSelInv(e.target.value)}>
                    <option value="">Seleccione un equipo o insumo…</option>
                    <optgroup label="Inventario del Laboratorio de Simulación">
                      {catalogoInv.map((rec: Row) => {
                        const activos = Math.max(0, (rec.quantity_total ?? 0) - (rec.maintenance_quantity ?? 0) - (rec.out_of_service_quantity ?? 0));
                        const noDisp = rec.status !== "DISPONIBLE" || activos <= 0;
                        const tag = noDisp
                          ? `No disponible (${rec.status})`
                          : `${activos} unid. en inventario${rec.allows_external_exit ? "" : " · Solo interno"}`;
                        return (
                          <option key={rec.id} value={rec.id} disabled={noDisp}>
                            {rec.name}{rec.numero_inventario ? ` [Inv: ${rec.numero_inventario}]` : ""} — {KIND[rec.resource_categories?.kind] ?? rec.resource_categories?.name ?? "Recurso"} ({tag})
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="¿No encuentras el elemento en la lista?">
                      <option value="__OTRO__">Otro (escribir insumo o equipo no listado)</option>
                    </optgroup>
                  </select>
                </L>
                <L t="Cantidad">
                  <Input type="number" min={1} value={selCant} onChange={(e) => setSelCant(Math.max(1, +e.target.value || 1))} />
                </L>
                <Button type="button" onClick={agregarItemPrestamo}>
                  <Plus className="h-4 w-4 mr-1" />Agregar
                </Button>
              </div>
              {selInv === "__OTRO__" && (
                <L t="Especifica el insumo o equipo que deseas prestar o trasladar">
                  <Input
                    placeholder="Ej. 2 cajas de guantes estériles talla M, gasas, material fungible…"
                    value={otroTexto}
                    onChange={(e) => setOtroTexto(e.target.value)}
                  />
                </L>
              )}
              {prestamoItems.length > 0 && (
                <div className="border rounded-xl bg-background divide-y overflow-hidden">
                  <div className="grid grid-cols-[64px_1fr_110px_40px] gap-2 px-3 py-1.5 text-xs font-semibold bg-muted">
                    <span>Cant.</span>
                    <span>Elemento</span>
                    <span>Inventario</span>
                    <span />
                  </div>
                  {prestamoItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-[64px_1fr_110px_40px] gap-2 px-3 py-1.5 items-center text-xs">
                      <span className="font-semibold">{it.cantidad}</span>
                      <span>
                        {it.descripcion}
                        {it.esOtro && (
                          <span className="ml-1.5 rounded bg-warning/30 px-1.5 py-0.5 text-[10px] font-medium">
                            Otro
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground">{it.numero_inventario || "—"}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setPrestamoItems(prestamoItems.filter((_, i) => i !== idx))}
                        aria-label="Quitar elemento"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <L t="Observaciones adicionales (opcional)">
              <Textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
            </L>
            <p className="text-xs text-muted-foreground">
              La solicitud queda pendiente de autorización por el Laboratorio de Simulación (formato <strong>VA-SL-FO-010</strong>). Al enviar, el responsable acepta la custodia y devolución oportuna de los bienes.
            </p>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <L t="Facultad"><select className={sel} value={h.facultad_entidad}
                onChange={(e) => setH({ ...h, facultad_entidad: e.target.value, programa: FACULTADES[e.target.value]?.[0] ?? "" })}>
                {Object.keys(FACULTADES).map((f) => <option key={f}>{f}</option>)}</select></L>
              <L t="Programa"><select className={sel} value={h.programa} onChange={(e) => setH({ ...h, programa: e.target.value })}>
                {(FACULTADES[h.facultad_entidad] ?? []).map((p) => <option key={p}>{p}</option>)}</select></L>
              <L t="Semestre"><Input type="number" value={h.semestre} onChange={(e) => setH({ ...h, semestre: e.target.value })} /></L>
              <L t="No. de participantes"><Input type="number" value={h.participants} onChange={(e) => setH({ ...h, participants: +e.target.value })} /></L>
              <L t="Persona que hace la reserva"><Input value={h.solicitante_nombre} onChange={(e) => setH({ ...h, solicitante_nombre: e.target.value })} /></L>
              <L t="Doc. #"><Input value={h.solicitante_documento} onChange={(e) => setH({ ...h, solicitante_documento: e.target.value })} /></L>
              <L t="Docente responsable"><Input value={h.docente_responsable_nombre} onChange={(e) => setH({ ...h, docente_responsable_nombre: e.target.value })} /></L>
              <L t="Doc. #"><Input value={h.docente_responsable_documento} onChange={(e) => setH({ ...h, docente_responsable_documento: e.target.value })} /></L>
              <L t="Teléfono"><Input value={h.telefono_contacto} onChange={(e) => setH({ ...h, telefono_contacto: e.target.value })} /></L>
            </div>
            <h3 className="text-sm font-semibold border-b pb-1 text-primary">Descripción</h3>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <L t="Módulo académico"><select className={sel} value={d.activity} onChange={(e) => setD({ ...d, activity: e.target.value })}>
                {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></L>
              <L t="Fecha de la actividad">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal"><CalendarIcon className="h-4 w-4" />{format(d.date, "PPP", { locale: es })}</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" locale={es} selected={d.date} onSelect={(x) => x && setD({ ...d, date: x })}
                      disabled={(x) => x < hoy} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </L>
              <L t="Hora inicio"><RelojHora value={d.start} onChange={(v) => setD({ ...d, start: v })} /></L>
              <L t="Hora fin (máx. 19:00)"><RelojHora value={d.end} onChange={(v) => setD({ ...d, end: v })} /></L>
              <L t="Repetir (reserva recurrente)"><select className={sel} value={modo} onChange={(e) => { const m = e.target.value as typeof modo; setModo(m); if (m === "MISMO" && semanas < 2) setSemanas(4); }}>
                <option value="NO">No repetir</option>
                <option value="MISMO">Mismo horario cada semana</option>
                <option value="DISTINTO">Otras fechas u horarios</option>
              </select></L>
            </div>
            {modo === "MISMO" && <div className="flex flex-wrap items-center gap-2 text-sm rounded-lg bg-accent text-accent-foreground px-3 py-2">
              Repetir el mismo día y hora durante
              <Input type="number" min={2} max={16} className="w-20 h-8 bg-background" value={semanas} onChange={(e) => setSemanas(Math.max(2, Math.min(16, +e.target.value || 2)))} />
              semanas (máx. 16). Cada solicitud se aprueba por separado.
            </div>}
            {modo === "DISTINTO" && <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">La primera sesión es la fecha y hora de arriba. Agrega las demás sesiones con la fecha y el horario que necesites.</p>
              {extras.map((x, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input type="date" className="w-40" min={format(hoy, "yyyy-MM-dd")} value={x.fecha} onChange={(e) => setExtras(extras.map((y, j) => j === i ? { ...y, fecha: e.target.value } : y))} />
                  <Input type="time" className="w-28" value={x.inicio} onChange={(e) => setExtras(extras.map((y, j) => j === i ? { ...y, inicio: e.target.value } : y))} />
                  a
                  <Input type="time" className="w-28" max="19:00" value={x.fin} onChange={(e) => setExtras(extras.map((y, j) => j === i ? { ...y, fin: e.target.value } : y))} />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>Quitar</Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" disabled={extras.length >= 15} onClick={() => {
                const last = extras.at(-1);
                const base = last ? new Date(`${last.fecha}T12:00:00`) : new Date(d.date);
                base.setDate(base.getDate() + 7);
                setExtras([...extras, { fecha: format(base, "yyyy-MM-dd"), inicio: last?.inicio ?? d.start, fin: last?.fin ?? d.end }]);
              }}>+ Agregar sesión</Button>
            </div>}
            <p className="text-xs text-muted-foreground">El espacio o laboratorio lo asigna el administrador al revisar la solicitud.</p>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Equipos o insumos requeridos (cantidades estándar del módulo; puede reducirlas, no superarlas)</p>
              <div className="border rounded-xl divide-y overflow-hidden">
                <div className="grid grid-cols-[80px_1fr] gap-2 px-3 py-1 text-xs font-semibold bg-muted"><span>Cantidad</span><span>Detalle</span></div>
                {items.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Este módulo no tiene lista estándar.</p>}
                {items.map((it, i) => (
                  <div key={it.resource_id} className="grid grid-cols-[80px_1fr] gap-2 px-3 py-1 items-center text-sm">
                    <Input type="number" min={0} max={it.std} className="h-8" value={it.cantidad}
                      onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, cantidad: Math.max(0, Math.min(it.std, +e.target.value)) } : x))} />
                    <span>{it.detalle}{disp[it.resource_id] !== undefined && it.cantidad > (disp[it.resource_id] ?? 0) && (
                      <span className="block text-xs text-destructive">Disponible: {disp[it.resource_id]}. El recurso {it.detalle} no tiene unidades disponibles en la fecha seleccionada debido a mantenimiento o fuera de servicio.</span>)}</span>
                  </div>
                ))}
              </div>
            </div>
            <L t="Observaciones"><Textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></L>
            {items.length > 0 && <p className="text-sm rounded-lg bg-accent text-accent-foreground px-3 py-2">{NOTA_30}</p>}
            {d.end > "19:00" && <p className="text-sm rounded-lg bg-destructive/10 text-destructive px-3 py-2">La hora de fin supera las 19:00 hrs: requiere autorización especial.</p>}
          </>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button onClick={submit} className="shadow-sm">
          {salida ? "Enviar solicitud de préstamo externo" : "Enviar solicitud"}
        </Button>
      </CardContent>
    </Card>
  );
}
export function ListaChequeo() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { supabase.from("activity_checklists").select("*").order("orden").then(({ data }) => setRows(data ?? [])); }, []);
  const modulos = [...new Set(rows.map((r) => r.modulo))];
  return (
    <Card>
      <CardHeader><CardTitle>Lista de chequeo por actividad / tipo de simulación</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {modulos.map((mod) => {
          const rs = rows.filter((r) => r.modulo === mod);
          const excl = rs.every((r) => r.excluido);
          return (
            <div key={mod} className="border rounded-md">
              <button className="w-full flex justify-between px-3 py-2 text-left" onClick={() => setOpen(open === mod ? null : mod)}>
                <span><strong>{mod}</strong></span>
                <span className={excl ? "text-destructive" : "text-muted-foreground"}>{excl ? "Excluido (REVISAR)" : `${rs.length} ítems`}</span>
              </button>
              {open === mod && (
                <div className="px-3 pb-2 space-y-2">
                  {[...new Set(rs.map((r) => r.estacion))].map((e) => (
                    <div key={e}>
                      <p className="text-xs font-semibold">{e}</p>
                      {rs.filter((r) => r.estacion === e).map((r) => (
                        <p key={r.id} className={`text-xs pl-2 ${r.excluido ? "line-through text-muted-foreground" : ""}`}>{r.cantidad_texto ?? "—"} · {r.item}</p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
export function FormatoPreviewModal({ r, onClose }: { r: Row; onClose: () => void }) {
  const tz = { timeZone: "America/Bogota" } as const;
  const t = (x?: string) => (x ? new Date(x).toLocaleTimeString("es-CO", { ...tz, hour: "2-digit", minute: "2-digit" }) : "");
  const dd = (x?: string) => (x ? new Date(x).toLocaleDateString("es-CO", tz) : "");
  const cell = "border border-foreground/40 px-2 py-1 align-top";
  const recs: Row[] = Array.isArray(r?.reservation_resources) ? r.reservation_resources : [];
  const filas = recs.length ? recs : [{}];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-auto print:max-h-none print:shadow-none">
        <DialogHeader className="print:hidden"><DialogTitle>Formato F-CS-01</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs text-foreground bg-background">
          <table className="w-full border-collapse"><tbody><tr>
            <td className={`${cell} w-32`}><img src={logo.url} alt="Logosímbolo Universidad de Antioquia" className="h-14 mx-auto object-contain" /></td>
            <td className={`${cell} text-center font-bold`}>UNIVERSIDAD DE ANTIOQUIA · FACULTAD DE MEDICINA<br />SOLICITUD DE RESERVA LABORATORIO DE SIMULACIÓN</td>
            <td className={`${cell} w-32`}>CÓDIGO: F-CS-01<br />VERSIÓN: 01</td></tr></tbody></table>
          <table className="w-full border-collapse"><tbody>
            <tr><td className={cell}>Fecha de solicitud: {dd(r.fecha_solicitud ?? r.created_at)}</td><td className={cell} colSpan={2}>Facultad o Entidad: {r.facultad_entidad ?? ""}</td></tr>
            <tr><td className={cell}>Programa: {r.programa ?? ""} · Semestre: {r.semestre ?? ""}</td><td className={cell}>No. de participantes: {r.participants ?? ""}</td><td className={cell}>Teléfono: {r.telefono_contacto ?? ""}</td></tr>
            <tr><td className={cell}>Persona que hace la reserva: {r.solicitante_nombre ?? ""} · Doc. # {r.solicitante_documento ?? ""}</td><td className={cell} colSpan={2}>Docente responsable: {r.docente_responsable_nombre ?? ""} · Doc. # {r.docente_responsable_documento ?? ""}</td></tr>
          </tbody></table>
          <p className="font-bold">DESCRIPCIÓN</p>
          <table className="w-full border-collapse"><thead><tr>
            {["Fecha", "Actividad", "Cantidad", "Detalle", "Lugar", "Hora inicio", "Hora fin"].map((x) => <th key={x} className={`${cell} text-left bg-muted`}>{x}</th>)}
          </tr></thead><tbody>
            {filas.map((x: Row, i: number) => (
              <tr key={i}>
                {i === 0 && <><td className={cell} rowSpan={filas.length}>{dd(r.starts_at)}</td><td className={cell} rowSpan={filas.length}>{r.activities?.name ?? ""}</td></>}
                <td className={cell}>{x?.cantidad_aprobada ?? x?.quantity ?? ""}</td><td className={cell}>{x?.resources?.name ?? ""}</td>
                {i === 0 && <><td className={cell} rowSpan={filas.length}>{r.spaces?.name ?? "Por asignar"}</td>
                  <td className={cell} rowSpan={filas.length}>{t(r.starts_at)}</td><td className={cell} rowSpan={filas.length}>{t(r.ends_at)}</td></>}
              </tr>
            ))}
          </tbody></table>
          <ul className="list-disc pl-5">
            <li>Aulas móviles (AM): Accesos y Operaciones en Emergencia (AOE), Transporte Asistencial (TA) y Primer Respondiente (PR)</li>
            <li>Lugar: (CEAPH) Centro de entrenamiento - (LDS) Laboratorio de Simulación - (LL) Living Lab</li>
          </ul>
          <p><strong>Nota:</strong> Si su reserva es para aulas móviles o equipos, el docente responsable debe estar media hora antes de la práctica.</p>
          <div className="grid grid-cols-2 gap-8 pt-10">
            <div className="border-t border-foreground/60 pt-1 text-center">Firma docente responsable</div>
            <div className="border-t border-foreground/60 pt-1 text-center">Firma Coordinación Laboratorio de Simulación</div>
          </div>
          <p className="text-muted-foreground">Estado: {r.status} · Laboratorio de Simulación - Facultad de Medicina - Edificio Andrés Posada Arango - Piso 3 - Tel. 2196043/2196950 simulacionmedicina@udea.edu.co</p>
          <div className="flex gap-2 print:hidden"><Button onClick={() => window.print()}>Imprimir / Guardar PDF</Button><Button variant="outline" onClick={onClose}>Cerrar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}