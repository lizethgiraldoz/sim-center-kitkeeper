import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-udea.png.asset.json";
import type { Row } from "@/lib/app-data";
const cell = "border border-foreground/40 px-2 py-1 align-top";
function dma(x?: string) {
  if (!x) return { d: "", m: "", a: "" };
  const p = new Date(x).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" }).split("/");
  return { d: p[0] ?? "", m: p[1] ?? "", a: p[2] ?? "" };
}
function parseLinea(linea: string) {
  const m = linea.trim().match(/^(\d+)\s*[×x]\s*(.+?)(?:\s*\(Inv:\s*([^)]+)\))?$/i);
  if (m) {
    return { cantidad: m[1] ?? "", descripcion: m[2]?.trim() ?? "", numero_inventario: m[3]?.trim() ?? "" };
  }
  return { cantidad: "", descripcion: linea.trim(), numero_inventario: "" };
}
export function FormatoSalidaModal({ r, onClose }: { r: Row; onClose: () => void }) {
  const form = Array.isArray(r.external_borrow_forms) ? r.external_borrow_forms[0] : r.external_borrow_forms;
  if (!form) return null;
  const fa = dma(form.departure_at ?? r.starts_at);
  const fd = dma(form.return_at ?? r.ends_at);
  const deReserva: Row[] = (r.reservation_resources ?? []).map((x: Row) => ({
    cantidad: x.cantidad_aprobada ?? x.quantity ?? "",
    descripcion: x.resources?.name ?? "",
    numero_inventario: x.resources?.numero_inventario ?? "",
  }));
  const items: Row[] = Array.isArray(form.items) && form.items.length
    ? form.items
    : (form.inventory_detail ?? "").trim()
      ? (form.inventory_detail ?? "").split("\n").filter((l: string) => l.trim()).map(parseLinea)
      : deReserva;
  const filas = items.length ? items : [{ cantidad: "", descripcion: "", numero_inventario: "" }];
  const estadoTexto =
    form.estado === "SALIDA_APROBADA"
      ? "SALIDA APROBADA"
      : form.estado === "SALIDA_RECHAZADA"
        ? "SALIDA RECHAZADA"
        : "PENDIENTE DE AUTORIZACIÓN";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-auto print:max-h-none print:shadow-none">
        <DialogHeader className="print:hidden"><DialogTitle>Formato VA-SL-FO-010</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs text-foreground bg-background">
          <table className="w-full border-collapse"><tbody><tr>
            <td className={`${cell} w-32`}><img src={logo.url} alt="Logosímbolo Universidad de Antioquia" className="h-14 mx-auto object-contain" /></td>
            <td className={`${cell} text-center font-bold`}>UNIVERSIDAD DE ANTIOQUIA · FACULTAD DE MEDICINA<br />AUTORIZACIÓN SALIDA DE BIENES PROPIEDAD DE LA UNIVERSIDAD<br />DIVISIÓN DE SERVICIOS LOGÍSTICOS</td>
            <td className={`${cell} w-32`}>CÓDIGO: VA-SL-FO-010<br />VERSIÓN: 01</td>
          </tr></tbody></table>
          <table className="w-full border-collapse"><tbody>
            <tr>
              <td className={cell}><strong>Dependencia Autorizada:</strong> {r.facultad_entidad ?? "Facultad de Medicina"}</td>
              <td className={cell}><strong>Dependencia responsable:</strong> Laboratorio de Simulación</td>
              <td className={cell}><strong>Fecha Autorización</strong><br />Día: {fa.d} · Mes: {fa.m} · Año: {fa.a}</td>
            </tr>
            <tr>
              <td className={cell} colSpan={3}><strong>Nombre persona que autoriza en la dependencia:</strong> {form.autoriza_nombre ?? ""} · <strong>Cargo:</strong> {form.autoriza_cargo ?? ""} · <strong>Teléfono:</strong> {form.autoriza_telefono ?? ""} · <strong>Correo electrónico Institucional:</strong> {form.autoriza_correo ?? ""}</td>
            </tr>
            <tr>
              <td className={cell} colSpan={3}><strong>Persona Autorizada a sacar el bien:</strong> {form.responsible_name ?? ""}{form.responsible_document ? ` · Doc. ${form.responsible_document}` : ""} · <strong>Cargo:</strong> {form.cargo ?? ""} · <strong>Teléfono:</strong> {form.responsible_phone ?? ""} · <strong>Correo electrónico Institucional:</strong> {form.correo_institucional ?? ""}</td>
            </tr>
          </tbody></table>
          <p className="font-bold">RELACIÓN DE LOS ELEMENTOS AUTORIZADOS A SALIR</p>
          <table className="w-full border-collapse">
            <thead><tr>
              <th className={`${cell} text-left bg-muted w-20`}>Cantidad</th>
              <th className={`${cell} text-left bg-muted`}>Descripción breve del elemento autorizado a salir</th>
              <th className={`${cell} text-left bg-muted w-36`}>Número de inventario</th>
            </tr></thead>
            <tbody>
              {filas.map((it: Row, i: number) => (
                <tr key={i}>
                  <td className={cell}>{it.cantidad ?? ""}</td>
                  <td className={cell}>{it.descripcion ?? ""}</td>
                  <td className={cell}>{it.numero_inventario ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full border-collapse"><tbody>
            <tr>
              <td className={cell}><strong>Destino u objeto de la salida:</strong> {form.destination ?? ""}{form.purpose ? ` — ${form.purpose}` : ""}{form.transport_vehicle ? ` · Transporte: ${form.transport_vehicle}` : ""}</td>
              <td className={cell}><strong>Fecha de devolución</strong><br />Día: {fd.d} · Mes: {fd.m} · Año: {fd.a}</td>
            </tr>
            <tr><td className={cell} colSpan={2}><strong>Observaciones:</strong> {form.observaciones ?? r.notes ?? ""}</td></tr>
          </tbody></table>
          <div className="grid grid-cols-2 gap-8 pt-10">
            <div className="border-t border-foreground/60 pt-1 text-center">Firma persona que autoriza</div>
            <div className="border-t border-foreground/60 pt-1 text-center">Firma persona autorizada a sacar el bien</div>
          </div>
          <p className="text-muted-foreground">Estado: {estadoTexto} · VA-SL-FO-010, Versión: 01 · Laboratorio de Simulación - Facultad de Medicina - Edificio Andrés Posada Arango - Piso 3 - Tel. 2196043/2196950 simulacionmedicina@udea.edu.co</p>
          <div className="flex gap-2 print:hidden"><Button onClick={() => window.print()}>Imprimir / Guardar PDF</Button><Button variant="outline" onClick={onClose}>Cerrar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}