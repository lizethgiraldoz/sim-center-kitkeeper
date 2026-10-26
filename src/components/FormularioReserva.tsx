import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
type Item = { resource_id: string; detalle: string; cantidad: number; std: number };

const LUGARES = [
  { v: "LDS", l: "LDS · Laboratorio de Simulación" },
  { v: "CEAPH", l: "CEAPH · Centro de entrenamiento" },
  { v: "LL", l: "LL · Living Lab" },
  { v: "AM", l: "AM · Aulas móviles" },
];
const AM = [
  { v: "AOE", l: "AOE · Accesos y Operaciones en Emergencia" },
  { v: "TA", l: "TA · Transporte Asistencial" },
  { v: "PR", l: "PR · Primer Respondiente" },
];
export const NOTA_30 = "Nota: Para aulas móviles o equipos, el docente responsable debe estar media hora antes de la práctica.";

const sel = "border rounded-md px-2 h-9 bg-background text-sm w-full";
const L = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <label className="space-y-1 text-xs text-muted-foreground block"><span>{t}</span>{children}</label>
);

export function FormularioReserva({ spaces, activities, onDone }: { spaces: Row[]; activities: Row[]; onDone: (msg: string) => void }) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [h, setH] = useState({
    facultad_entidad: "Medicina", programa: "Medicina", semestre: "13", participants: 20, telefono_contacto: "",
    solicitante_nombre: "", solicitante_documento: "", docente_responsable_nombre: "", docente_responsable_documento: "",
  });
  const [d, setD] = useState({ activity: "", space: "", date: tomorrow, start: "08:00", end: "12:00", lugar: "LDS", am: "", leaves: false, notes: "" });
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setD((p) => ({ ...p, activity: p.activity || activities.find((a) => a.name.startsWith("Módulo Adultos 1"))?.id || activities[0]?.id || "",
      space: p.space || spaces.find((s) => s.name.startsWith("Aula 207"))?.id || spaces[0]?.id || "" }));
  }, [activities, spaces]);

  useEffect(() => {
    if (!d.activity) return;
    supabase.rpc("formulario_plantilla", { _activity_id: d.activity }).then(({ data }) =>
      setItems((data ?? []).map((x: Row) => ({ resource_id: x.resource_id, detalle: x.detalle, cantidad: x.cantidad, std: x.cantidad }))));
  }, [d.activity]);

  const space = spaces.find((s) => s.id === d.space);
  const needs30 = d.lugar === "AM" || space?.type === "MOVIL";
  const iso = (t: string) => new Date(`${d.date}T${t}:00-05:00`).toISOString();

  const submit = async () => {
    setErr("");
    if (d.end > "19:00") { setErr("El horario solicitado supera el límite operativo permitido (19:00 hrs). Requiere autorización especial."); return; }
    const { data, error } = await supabase.rpc("crear_solicitud_formulario", {
      _f: { ...h, semestre: h.semestre, activity_id: d.activity, space_id: d.space, starts_at: iso(d.start), ends_at: iso(d.end),
        lugar_tipo: d.lugar, aulas_moviles_subtipo: d.lugar === "AM" ? d.am : "", leaves_faculty: d.leaves, notes: d.notes,
        items: items.map((i) => ({ resource_id: i.resource_id, cantidad: i.cantidad })) },
    });
    if (error) { setErr(error.message); return; }
    const nota = (data as Row)?.nota;
    onDone(nota ? `Solicitud creada. ${nota}` : "Solicitud creada");
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Universidad de Antioquia · Facultad de Medicina · Laboratorio de Simulación</p>
            <CardTitle>Solicitud de reserva</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground text-right">Código: F-CS-01<br />Versión: 01</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <L t="Facultad o Entidad"><Input value={h.facultad_entidad} onChange={(e) => setH({ ...h, facultad_entidad: e.target.value })} /></L>
          <L t="Programa"><Input value={h.programa} onChange={(e) => setH({ ...h, programa: e.target.value })} /></L>
          <L t="Semestre"><Input type="number" value={h.semestre} onChange={(e) => setH({ ...h, semestre: e.target.value })} /></L>
          <L t="No. de participantes"><Input type="number" value={h.participants} onChange={(e) => setH({ ...h, participants: +e.target.value })} /></L>
          <L t="Persona que hace la reserva"><Input value={h.solicitante_nombre} onChange={(e) => setH({ ...h, solicitante_nombre: e.target.value })} /></L>
          <L t="Doc. #"><Input value={h.solicitante_documento} onChange={(e) => setH({ ...h, solicitante_documento: e.target.value })} /></L>
          <L t="Docente responsable"><Input value={h.docente_responsable_nombre} onChange={(e) => setH({ ...h, docente_responsable_nombre: e.target.value })} /></L>
          <L t="Doc. #"><Input value={h.docente_responsable_documento} onChange={(e) => setH({ ...h, docente_responsable_documento: e.target.value })} /></L>
          <L t="Teléfono"><Input value={h.telefono_contacto} onChange={(e) => setH({ ...h, telefono_contacto: e.target.value })} /></L>
        </div>

        <h3 className="text-sm font-semibold border-b pb-1">Descripción</h3>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <L t="Actividad (es)"><select className={sel} value={d.activity} onChange={(e) => setD({ ...d, activity: e.target.value })}>
            {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></L>
          <L t="Lugar"><select className={sel} value={d.lugar} onChange={(e) => setD({ ...d, lugar: e.target.value })}>
            {LUGARES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</select></L>
          {d.lugar === "AM" && <L t="Tipo de aula móvil"><select className={sel} value={d.am} onChange={(e) => setD({ ...d, am: e.target.value })}>
            <option value="">Seleccione…</option>{AM.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}</select></L>}
          <L t="Espacio / aula"><select className={sel} value={d.space} onChange={(e) => setD({ ...d, space: e.target.value })}>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>
          <L t="Fecha de la actividad"><Input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></L>
          <L t="Hora inicio"><Input type="time" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} /></L>
          <L t="Hora fin (máx. 19:00)"><Input type="time" max="19:00" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} /></L>
          <label className="flex items-center gap-2 text-sm pt-5"><input type="checkbox" checked={d.leaves} onChange={(e) => setD({ ...d, leaves: e.target.checked })} /> Sale de la Facultad</label>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Equipos o insumos requeridos (cantidades estándar del módulo; puede reducirlas, no superarlas)</p>
          <div className="border rounded-md divide-y">
            <div className="grid grid-cols-[80px_1fr] gap-2 px-3 py-1 text-xs font-semibold bg-muted"><span>Cantidad</span><span>Detalle</span></div>
            {items.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Este módulo no tiene lista estándar.</p>}
            {items.map((it, i) => (
              <div key={it.resource_id} className="grid grid-cols-[80px_1fr] gap-2 px-3 py-1 items-center text-sm">
                <Input type="number" min={0} max={it.std} className="h-8" value={it.cantidad}
                  onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, cantidad: Math.max(0, Math.min(it.std, +e.target.value)) } : x))} />
                <span>{it.detalle}</span>
              </div>
            ))}
          </div>
        </div>

        <L t="Observaciones"><Input value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></L>
        {(needs30 || items.length > 0) && <p className="text-sm rounded-md bg-accent text-accent-foreground px-3 py-2">{NOTA_30}</p>}
        {d.end > "19:00" && <p className="text-sm rounded-md bg-destructive/10 text-destructive px-3 py-2">La hora de fin supera las 19:00 hrs: requiere autorización especial.</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button onClick={submit}>Enviar solicitud</Button>
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

export function FormatoImprimible({ r, onClose }: { r: Row; onClose: () => void }) {
  const t = (s: string) => new Date(s).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });
  const dd = (s: string) => new Date(s).toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
  const cell = "border px-2 py-1";
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-auto p-6 print:p-0">
      <div className="max-w-4xl mx-auto space-y-3 text-sm">
        <div className="flex gap-2 print:hidden"><Button onClick={() => window.print()}>Imprimir / Guardar PDF</Button><Button variant="outline" onClick={onClose}>Cerrar</Button></div>
        <table className="w-full border-collapse"><tbody><tr>
          <td className={cell}>UNIVERSIDAD DE ANTIOQUIA 1803<br />FACULTAD DE MEDICINA</td>
          <td className={`${cell} text-center font-bold`}>SOLICITUD DE RESERVA<br />LABORATORIO DE SIMULACIÓN</td>
          <td className={cell}>CÓDIGO: F-CS-01<br />VERSIÓN: 01</td></tr></tbody></table>
        <table className="w-full border-collapse"><tbody>
          <tr><td className={cell}>Fecha de solicitud: {dd(r.fecha_solicitud ?? r.created_at)}</td><td className={cell} colSpan={2}>Facultad o Entidad: {r.facultad_entidad}</td></tr>
          <tr><td className={cell}>Programa: {r.programa} · Semestre: {r.semestre ?? ""}</td><td className={cell}>No. de participantes: {r.participants}</td><td className={cell}>Teléfono: {r.telefono_contacto ?? ""}</td></tr>
          <tr><td className={cell}>Persona que hace la reserva: {r.solicitante_nombre ?? ""} · Doc. # {r.solicitante_documento ?? ""}</td><td className={cell} colSpan={2}>Docente responsable: {r.docente_responsable_nombre ?? ""} · Doc. # {r.docente_responsable_documento ?? ""}</td></tr>
        </tbody></table>
        <p className="font-bold">DESCRIPCIÓN</p>
        <table className="w-full border-collapse"><thead><tr>
          {["Fecha de la actividad", "Actividad (es)", "Cantidad", "Detalle", "Lugar", "Hora inicio", "Hora fin"].map((x) => <th key={x} className={`${cell} text-left`}>{x}</th>)}
        </tr></thead><tbody>
          {(r.reservation_resources?.length ? r.reservation_resources : [{}]).map((x: Row, i: number) => (
            <tr key={i}>
              {i === 0 && <><td className={cell} rowSpan={r.reservation_resources?.length || 1}>{dd(r.starts_at)}</td><td className={cell} rowSpan={r.reservation_resources?.length || 1}>{r.activities?.name}</td></>}
              <td className={cell}>{x.quantity ?? ""}</td><td className={cell}>{x.resources?.name ?? ""}</td>
              {i === 0 && <><td className={cell} rowSpan={r.reservation_resources?.length || 1}>{r.spaces?.name} ({r.lugar_tipo}{r.aulas_moviles_subtipo ? ` · ${r.aulas_moviles_subtipo}` : ""})</td>
                <td className={cell} rowSpan={r.reservation_resources?.length || 1}>{t(r.starts_at)}</td><td className={cell} rowSpan={r.reservation_resources?.length || 1}>{t(r.ends_at)}</td></>}
            </tr>
          ))}
        </tbody></table>
        <ul className="list-disc pl-5 text-xs">
          <li>Aulas móviles (AM): Accesos y Operaciones en Emergencia (AOE), Transporte Asistencial (TA) y Primer Respondiente (PR)</li>
          <li>Lugar: (CEAPH) Centro de entrenamiento - (LDS) Laboratorio de Simulación - (LL) Living Lab</li>
        </ul>
        <p className="text-xs"><strong>Nota:</strong> Si su reserva es para aulas móviles o equipos, el docente responsable debe estar media hora antes de la práctica.</p>
        <p className="text-xs">Estado: {r.status}</p>
        <p className="text-xs text-muted-foreground">Laboratorio de Simulación - Facultad de Medicina - Edificio Andrés Posada Arango - Piso 3 - Tel. 2196043/2196950 simulacionmedicina@udea.edu.co</p>
      </div>
    </div>
  );
}
