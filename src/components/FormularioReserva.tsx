import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Truck } from "lucide-react";
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

export const FACULTADES: Record<string, string[]> = {
  "Facultad de Medicina": ["Medicina", "Instrumentación Quirúrgica", "Tecnologías"],
  "Facultad de Enfermería": ["Enfermería"],
};
export const NOTA_30 = "Nota: Para aulas móviles o equipos, el docente responsable debe estar media hora antes de la práctica.";

const sel = "border border-input rounded-lg px-2 h-9 bg-background text-foreground text-sm w-full shadow-sm";
const L = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <label className="space-y-1 text-xs font-medium text-muted-foreground block"><span>{t}</span>{children}</label>
);
const EXT0 = { destination: "", responsible_name: "", responsible_document: "", responsible_phone: "", transport_vehicle: "", departure_at: "", return_at: "", inventory_detail: "", purpose: "" };

export function FormularioReserva({ activities, onDone }: { spaces?: Row[]; activities: Row[]; onDone: (msg: string) => void }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [h, setH] = useState({
    facultad_entidad: "Facultad de Medicina", programa: "Medicina", semestre: "13", participants: 20, telefono_contacto: "",
    solicitante_nombre: "", solicitante_documento: "", docente_responsable_nombre: "", docente_responsable_documento: "",
  });
  const [d, setD] = useState({ activity: "", date: new Date(Date.now() + 86400000), start: "08:00", end: "12:00", notes: "" });
  const [salida, setSalida] = useState(false);
  const [ext, setExt] = useState(EXT0);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");

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
    if (!d.activity || d.end <= d.start) return;
    supabase.rpc("disponibilidad_plantilla", { _activity_id: d.activity, _starts: iso(d.start), _ends: iso(d.end) })
      .then(({ data }) => setDisp(Object.fromEntries((data ?? []).map((x: Row) => [x.resource_id, x.disponible]))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.activity, ymd, d.start, d.end]);
  const sinStock = items.filter((i) => i.cantidad > 0 && disp[i.resource_id] !== undefined && i.cantidad > (disp[i.resource_id] ?? 0));
  const isoLocal = (v: string) => (v ? new Date(`${v}:00-05:00`).toISOString() : "");

  const submit = async () => {
    setErr("");
    if (d.date < hoy) { setErr("No se pueden solicitar reservas en fechas pasadas."); return; }
    if (d.end > "19:00") { setErr("El horario solicitado supera el límite operativo permitido (19:00 hrs). Requiere autorización especial."); return; }
    if (salida && (!ext.destination || !ext.responsible_name || !ext.transport_vehicle || !ext.departure_at || !ext.return_at)) {
      setErr("Complete la Solicitud de Préstamo y Salida Externa (destino, responsable, transporte, salida y retorno)."); return;
    }
    if (sinStock.length) { setErr(`El recurso ${sinStock[0]?.detalle} no tiene unidades disponibles en la fecha seleccionada debido a mantenimiento o fuera de servicio.`); return; }
    const { error } = await supabase.rpc("crear_solicitud_formulario", {
      _f: { ...h, activity_id: d.activity, starts_at: iso(d.start), ends_at: iso(d.end), notes: d.notes,
        items: items.map((i) => ({ resource_id: i.resource_id, cantidad: i.cantidad })),
        ...(salida ? { salida: { ...ext, departure_at: isoLocal(ext.departure_at), return_at: isoLocal(ext.return_at), accepts_responsibility: true } } : {}) },
    });
    if (error) { setErr(error.message); return; }
    onDone("Solicitud enviada. El administrador asignará el espacio al revisarla.");
  };

  const E = (k: keyof typeof EXT0, t: string, type = "text") => (
    <L t={t}><Input type={type} value={ext[k]} onChange={(e) => setExt({ ...ext, [k]: e.target.value })} /></L>
  );

  return (
    <Card className="rounded-xl shadow-md">
      <CardHeader className="border-b bg-primary/5 rounded-t-xl">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Universidad de Antioquia · Laboratorio de Simulación</p>
            <CardTitle className="text-primary">Solicitud de reserva</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground text-right">Código: F-CS-01<br />Versión: 01</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
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
        </div>
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

        <div className="rounded-xl border p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-sm flex items-center gap-2"><Truck className="h-4 w-4 text-primary" />Solicitud de Préstamo y Salida Externa</p>
            <Button type="button" size="sm" variant={salida ? "secondary" : "outline"} onClick={() => setSalida(!salida)}>
              {salida ? "Quitar salida externa" : "Los recursos salen de la sede"}</Button>
          </div>
          {salida && (
            <div className="grid gap-3 sm:grid-cols-2">
              {E("destination", "Lugar de destino")}
              {E("responsible_name", "Responsable del traslado")}
              {E("responsible_document", "Documento del responsable")}
              {E("responsible_phone", "Teléfono del responsable")}
              {E("transport_vehicle", "Vehículo / transporte")}
              {E("purpose", "Propósito")}
              {E("departure_at", "Fecha y hora de salida", "datetime-local")}
              {E("return_at", "Fecha y hora de retorno", "datetime-local")}
              <div className="sm:col-span-2"><L t="Inventario detallado que sale"><Textarea value={ext.inventory_detail} onChange={(e) => setExt({ ...ext, inventory_detail: e.target.value })} /></L></div>
              <p className="sm:col-span-2 text-xs text-muted-foreground">Al enviar, el responsable acepta la custodia de los recursos durante la salida.</p>
            </div>
          )}
        </div>

        {items.length > 0 && <p className="text-sm rounded-lg bg-accent text-accent-foreground px-3 py-2">{NOTA_30}</p>}
        {d.end > "19:00" && <p className="text-sm rounded-lg bg-destructive/10 text-destructive px-3 py-2">La hora de fin supera las 19:00 hrs: requiere autorización especial.</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button onClick={submit} className="shadow-sm">Enviar solicitud</Button>
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
