import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileSpreadsheet, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EstadoBadge } from "@/components/EstadoBadge";
import { ListaChequeo } from "@/components/FormularioReserva";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import type { Row } from "@/lib/app-data";
export const Route = createFileRoute("/_authenticated/inventario")({
  head: () => ({ meta: [{ title: "Inventario y quirófano · Laboratorio de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});
const ESTADOS = ["DISPONIBLE", "EN_MANTENIMIENTO", "FUERA_DE_SERVICIO"] as const;
const KIND: Record<string, string> = {
  EQUIPO: "Equipo",
  SIMULADOR: "Simulador",
  INSUMO: "Insumo",
  PAQUETE_QUIRURGICO: "Paquete quirúrgico",
};
type ItemExcelInventario = {
  nombre: string;
  placas: string[];
  descripcion: string;
  kind: "SIMULADOR" | "EQUIPO";
};
const INVENTARIO_EXCEL: ItemExcelInventario[] = [
  { nombre: "TORSO REANIMACION ADULTO", placas: ["130398-1", "130398-2", "130398-3", "130398-4", "150723-1", "150723-2", "150723-3", "150723-4"], descripcion: "simulador para practicas de ventilación con presión positiva y compresiones torácicas", kind: "SIMULADOR" },
  { nombre: "TORSO REANIMACION PEDIATRICO", placas: ["150725-1", "150725-2", "150725-3", "150725-4", "100013-1", "100013-2", "100013-3", "100013-4"], descripcion: "simulador para practicas de ventilación con presión positiva y compresiones torácicas", kind: "SIMULADOR" },
  { nombre: "DEA ENTRENAMIENTO LAERDAL", placas: ["196355", "196356", "196357", "167504", "157861", "157865", "157862", "157863"], descripcion: "simular desfibrilación externa adultos, niños y lactantes", kind: "EQUIPO" },
  { nombre: "SIMULADOR OVACE ADULTO", placas: ["167548-1"], descripcion: "para maniobra de desobstrucción de vía aérea", kind: "SIMULADOR" },
  { nombre: "SIMULADOR OVACE ADOLECENTE", placas: ["167548-2"], descripcion: "para maniobra de desobstrucción de vía aérea", kind: "SIMULADOR" },
  { nombre: "SIMULADOR OVACE NIñO", placas: ["167548-3"], descripcion: "para maniobra de desobstrucción de vía aérea", kind: "SIMULADOR" },
  { nombre: "SIMULADOR OVACE BEBE", placas: ["167548-4"], descripcion: "para maniobra de desobstrucción de vía aérea", kind: "SIMULADOR" },
  { nombre: "BABY ANNE", placas: ["157859-1", "157859-2", "157859-3", "157859-4", "157860-1", "157860-2", "157860-3", "157860-4"], descripcion: "simulador lactante para rcp y OVACE", kind: "SIMULADOR" },
  { nombre: "CAMILLA", placas: ["122040", "122041", "122042", "122043"], descripcion: "CAMILLA adulto sencilla / CAMILLA pediátrica sencilla", kind: "EQUIPO" },
  { nombre: "BOTIQUIN TRUAMA AVANZADO", placas: ["LS001", "LS002", "LS003"], descripcion: "Botiquín Negro y verde grande con elementos para manejo avanzado de trauma", kind: "EQUIPO" },
  { nombre: "SIMNA 3G", placas: ["157739-1"], descripcion: "simulador cuerpo completo para soporte vital avanzado", kind: "SIMULADOR" },
  { nombre: "COMPUTADOR TODO EN 1", placas: ["157739-2", "157738-2", "157740-3"], descripcion: "Monitoreo signos vitales", kind: "EQUIPO" },
  { nombre: "PORTATIL", placas: ["157739-3", "157738-5", "157740-4"], descripcion: "Pc instructor manejo simulador", kind: "EQUIPO" },
  { nombre: "CAMARA WEB", placas: ["157739-4", "157738-4", "157740-5"], descripcion: "para grabación de examen", kind: "EQUIPO" },
  { nombre: "MICROFONO DIADEMA", placas: ["157739-5", "157740-6"], descripcion: "para el instructor hablar por el simulador", kind: "EQUIPO" },
  { nombre: "SIMNEWB (SIMULADOR NEONATO)", placas: ["157738-1"], descripcion: "Simulador neonato para soporte vital avanzado neonatal", kind: "SIMULADOR" },
  { nombre: "SIMPAD", placas: ["157738-3"], descripcion: "Pc instructor manejo simulador", kind: "EQUIPO" },
  { nombre: "SIMMOM (SIMULADOR MATERNO FETAL)", placas: ["157740-1"], descripcion: "Simulador avanzado para parto , código rojo y urgencias ginecológicas", kind: "SIMULADOR" },
  { nombre: "BEBE SIMMOM", placas: ["157740-2"], descripcion: "bebe simom para parto", kind: "SIMULADOR" },
  { nombre: "SIMULADOR PARA TRAUMA Y EXTRICACION", placas: ["134632"], descripcion: "Simulador cuerpo completo para manejo del trauma y vía aérea", kind: "SIMULADOR" },
  { nombre: "TABLA DE INMOVILIZACIÓN BAXSTRAP", placas: ["167544", "167545", "167546", "167547"], descripcion: "Tabla rígida para inmovilización de cuerpo completo con arnés de sujeción y bloqueadores laterales", kind: "EQUIPO" },
  { nombre: "SIMULADOR SIMMAN", placas: ["137684", "137685"], descripcion: "simulador SimMan básico para soporte vital avanzado", kind: "SIMULADOR" },
  { nombre: "NEONATO PARA REANIMACIÓN NEWBORN ANNE", placas: ["157776", "157777", "157858-1", "157858-2"], descripcion: "Neonato para reanimación , manejo vía aérea y cateterismo umbilical", kind: "SIMULADOR" },
  { nombre: "SIMULADOR \"PRIMEROS AUXILIOS CUERPO COMPLETO\"", placas: ["18732", "18733", "18734", "18735", "18736", "18737"], descripcion: "Simulador cuerpo completo para manejo del trauma y reanimación", kind: "SIMULADOR" },
  { nombre: "CILINDRO OXIGENO", placas: ["134571-2", "152471", "167055"], descripcion: "practicas oxigenoterapia", kind: "EQUIPO" },
  { nombre: "CARRO DE PARO", placas: ["188260", "134571-1"], descripcion: "Para practica de manejo del paciente en urgencias", kind: "EQUIPO" },
  { nombre: "SIMULADOR SIMBABY", placas: ["184917-1"], descripcion: "Simulador avanzado lactante", kind: "SIMULADOR" },
  { nombre: "COMPUTADOR TODO EN UNO HP", placas: ["184917-2"], descripcion: "pc para monitoreo de signos vitales", kind: "EQUIPO" },
  { nombre: "COMPUTADOR PORTATIL HP", placas: ["184917-3"], descripcion: "pc para controlar simulador", kind: "EQUIPO" },
  { nombre: "CAJA DE CONTROL LIMBOX", placas: ["184917-4"], descripcion: "caja de conexión y enlace entre equipos", kind: "EQUIPO" },
  { nombre: "COMPRESOR", placas: ["184917-5"], descripcion: "para generar aire de respiración y movimientos", kind: "EQUIPO" },
  { nombre: "CARDIO DESFIBRILADOR MANUAL", placas: ["188250", "188251", "188252", "188253"], descripcion: "Desfibrilador real para uso en simuladores", kind: "EQUIPO" },
  { nombre: "ENTRENADOR RCP/VIAS RESPIRATORIAS ADULTO", placas: ["189205", "189885"], descripcion: "Cabaza de intubación adulto para manejo avanzado", kind: "SIMULADOR" },
  { nombre: "ENTRENADOR VIAS RESPIRATORIAS/RCP MULTIPROPOSITO", placas: ["189886"], descripcion: "Cabaza de intubación adulto para manejo avanzado", kind: "SIMULADOR" },
  { nombre: "MEGACODE KELLY KIT ADVANCED", placas: ["134629"], descripcion: "Simulador pediátrico para monitoreo y manejo de vía aérea", kind: "SIMULADOR" },
  { nombre: "LAERDAL NEONATAL INTUBATION TRAINER", placas: ["157774", "157775"], descripcion: "Cabeza para intubacion neonatal", kind: "SIMULADOR" },
  { nombre: "CABEZAS DE INTUBACION LACTANTES", placas: ["190352", "190353"], descripcion: "Cabeza para intubacion en lactantes", kind: "SIMULADOR" },
  { nombre: "SIMULADOR DE CRICOTIROIDOTOMIA", placas: ["167511"], descripcion: "para realizar practicas de cricotiroidotomia", kind: "SIMULADOR" },
  { nombre: "TORSO VIA AEREA PEDIATRICO", placas: ["167508", "167509"], descripcion: "Cabeza para intubacion pediatrica", kind: "SIMULADOR" },
  { nombre: "TORSO VIA AEREA ADULTO", placas: ["167506"], descripcion: "Cabeza para intubacion en adultos", kind: "SIMULADOR" },
  { nombre: "SIMULADOR OVACE - ADULTO", placas: ["161769", "161770"], descripcion: "para maniobra de desobstrucción de vía aérea", kind: "SIMULADOR" },
  { nombre: "SIMULADOR DE \"PUNCIÓN INTRAÓSEA\"", placas: ["167513", "146769"], descripcion: "Acceso intraoseo lactante / Acceso intraoseo pediatrico", kind: "SIMULADOR" },
];
function corregirNombreTorso(nombre: string): string {
  return nombre.replace(/\bTOROSO\b/gi, (m) => (m === m.toLowerCase() ? "torso" : "TORSO"));
}
function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizarClave(s: string): string {
  return normalizarTexto(corregirNombreTorso(s)).replace(/-/g, " ").replace(/\s+/g, " ").trim();
}
function parsePlacas(raw?: string | null): string[] {
  if (!raw) return [];
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const parte of raw.split(/[,;\n]+/)) {
    const p = parte.trim();
    if (!p) continue;
    const key = p.toUpperCase();
    if (!vistas.has(key)) {
      vistas.add(key);
      out.push(p);
    }
  }
  return out;
}
function escaparRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function reemplazarTokenPlaca(texto: string, placaVieja: string, placaNueva: string): string {
  const rx = new RegExp(`(^|[^A-Za-z0-9-])(${escaparRegExp(placaVieja)})(?=$|[^A-Za-z0-9-])`, "gi");
  return texto.replace(rx, (_match, prefijo) => `${prefijo}${placaNueva}`);
}
function comprimirRepetidas(s: string): string {
  return s.replace(/(.)\1+/g, "$1");
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
function evaluarCoincidencia(query: string, r: Row): { score: number; exacta: boolean } {
  const q = normalizarTexto(query);
  if (!q) return { score: 100, exacta: true };
  const nombre = normalizarTexto(String(r.name ?? ""));
  const desc = normalizarTexto(String(r.descripcion ?? ""));
  const placa = normalizarTexto(String(r.numero_inventario ?? ""));
  const tipo = normalizarTexto(String(KIND[r.resource_categories?.kind] ?? r.resource_categories?.name ?? ""));
  const todo = `${nombre} ${desc} ${placa} ${tipo}`.trim();
  if (nombre === q || placa === q) return { score: 100, exacta: true };
  if (nombre.startsWith(q)) return { score: 95, exacta: true };
  if (nombre.split(" ").includes(q)) return { score: 92, exacta: true };
  if (nombre.includes(q)) return { score: 88, exacta: true };
  if (placa.includes(q)) return { score: 85, exacta: true };
  if (desc.includes(q) || tipo.includes(q)) return { score: 80, exacta: true };
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => todo.includes(t))) {
    return { score: 82, exacta: true };
  }
  const palabrasObjetivo = Array.from(new Set(todo.split(" ").filter(Boolean)));
  let sumaSimilitud = 0;
  let tokensCoincidentes = 0;
  for (const qt of tokens) {
    if (qt.length < 2) {
      if (todo.includes(qt)) {
        sumaSimilitud += 0.8;
        tokensCoincidentes++;
      }
      continue;
    }
    let mejorSim = 0;
    const qtComp = comprimirRepetidas(qt);
    for (const tw of palabrasObjetivo) {
      if (tw.includes(qt) || (qt.includes(tw) && tw.length >= 3)) {
        mejorSim = Math.max(mejorSim, 0.85);
        continue;
      }
      const twComp = comprimirRepetidas(tw);
      if (qtComp === twComp) {
        mejorSim = Math.max(mejorSim, 0.82);
        continue;
      }
      const d1 = levenshtein(qt, tw);
      const sim1 = 1 - d1 / Math.max(qt.length, tw.length);
      const d2 = levenshtein(qtComp, twComp);
      const sim2 = 1 - d2 / Math.max(qtComp.length, twComp.length);
      mejorSim = Math.max(mejorSim, sim1, sim2 * 0.96);
    }
    if (mejorSim >= 0.56) {
      tokensCoincidentes++;
      sumaSimilitud += mejorSim;
    }
  }
  if (tokensCoincidentes === 0) return { score: 0, exacta: false };
  const cobertura = tokensCoincidentes / tokens.length;
  if (cobertura < 0.5) return { score: 0, exacta: false };
  const promedio = sumaSimilitud / tokens.length;
  return { score: Number((promedio * cobertura * 75).toFixed(2)), exacta: false };
}
type CambioPlacaItem = {
  indice: number;
  anterior: string;
  nueva: string;
};
function Page() {
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [filtroAplicado, setFiltroAplicado] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  // Estado del modal de edición individual de placas
  const [recursoPlacasModal, setRecursoPlacasModal] = useState<Row | null>(null);
  const [placasOriginalesModal, setPlacasOriginalesModal] = useState<string[]>([]);
  const [placasEditadasModal, setPlacasEditadasModal] = useState<string[]>([]);
  const [indiceSeleccionadoModal, setIndiceSeleccionadoModal] = useState<number>(0);
  const [nuevaPlacaInput, setNuevaPlacaInput] = useState("");
  const [confirmacionPlacasAbierta, setConfirmacionPlacasAbierta] = useState(false);
  const [guardandoPlacas, setGuardandoPlacas] = useState(false);
  // Estado del modal de edición de descripción
  const [recursoDescModal, setRecursoDescModal] = useState<Row | null>(null);
  const [textoDescModal, setTextoDescModal] = useState("");
  const [guardandoDesc, setGuardandoDesc] = useState(false);
  const [recursoEstadosModal, setRecursoEstadosModal] = useState<Row | null>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const topInnerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ["inventario"],
    queryFn: async () => {
      const nowMs = Date.now();
      const [r, k, a] = await Promise.all([
        supabase.from("resources").select("*, resource_categories(name, kind)").order("name"),
        supabase.from("quirofano_instrumental").select("*"),
        supabase
          .from("reservation_resources")
          .select("resource_id, quantity, cantidad_aprobada, resources(name), reservations!inner(id, status, starts_at, ends_at, leaves_faculty, salida_estado, solicitante_nombre, docente_responsable_nombre, notes, spaces(name), external_exit_forms(responsible_name, destination, departure_at, return_at, items, estado))")
          .in("reservations.status", ["APROBADA", "EN_CURSO"]),
      ]);
      const reservados: Record<string, number> = {};
      const usosPorRecurso: Record<string, Row[]> = {};
      (a.data ?? []).forEach((x: Row) => {
        const res = Array.isArray(x.reservations) ? x.reservations[0] : x.reservations;
        if (!res) return;
        const esPrestamoExterno = Boolean(res.leaves_faculty);
        const sigueOcupado = esPrestamoExterno
          ? res.salida_estado !== "RETORNADO"
          : new Date(res.ends_at).getTime() >= nowMs;
        if (!sigueOcupado) return;
        const cant = Number(x.cantidad_aprobada ?? x.quantity ?? 0);
        if (cant > 0) {
          reservados[x.resource_id] = (reservados[x.resource_id] ?? 0) + cant;
          const formRaw = Array.isArray(res.external_exit_forms)
            ? res.external_exit_forms[0]
            : res.external_exit_forms;
          const resInfo = Array.isArray(x.resources) ? x.resources[0] : x.resources;
          const spaceInfo = Array.isArray(res.spaces) ? res.spaces[0] : res.spaces;
          const placasAsignadas: string[] = [];
          if (Array.isArray(formRaw?.items)) {
            for (const it of formRaw.items) {
              const coincideNombre =
                String(it?.descripcion ?? "").trim().toLowerCase() ===
                String(resInfo?.name ?? "").trim().toLowerCase();
              if (coincideNombre && it?.numero_inventario) {
                placasAsignadas.push(...parsePlacas(String(it.numero_inventario)));
              }
            }
          }
          if (!usosPorRecurso[x.resource_id]) usosPorRecurso[x.resource_id] = [];
          usosPorRecurso[x.resource_id].push({
            id: res.id,
            cantidad: cant,
            esExterno: esPrestamoExterno,
            quien:
              formRaw?.responsible_name ||
              res.docente_responsable_nombre ||
              res.solicitante_nombre ||
              "Docente / Solicitante sin nombre",
            destino: formRaw?.destination || spaceInfo?.name || "Laboratorio de Simulación",
            inicio: formRaw?.departure_at ?? res.starts_at,
            fin: formRaw?.return_at ?? res.ends_at,
            placasAsignadas,
          });
        }
      });
      return { recursos: r.data ?? [], kits: k.data ?? [], reservados, usosPorRecurso };
    },
  });
  const cambiar = async (
    id: string,
    patch: {
      name?: string;
      status?: (typeof ESTADOS)[number];
      maintenance_quantity?: number;
      out_of_service_quantity?: number;
      numero_inventario?: string | null;
      code?: string | null;
      descripcion?: string | null;
    }
  ) => {
    const { error } = await supabase.from("resources").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Inventario actualizado");
      q.refetch();
    }
  };
  const abrirModalPlacas = (r: Row) => {
    const actuales = parsePlacas(r.numero_inventario);
    setRecursoPlacasModal(r);
    setPlacasOriginalesModal(actuales);
    setPlacasEditadasModal([...actuales]);
    setIndiceSeleccionadoModal(0);
    setNuevaPlacaInput("");
    setConfirmacionPlacasAbierta(false);
  };
  const cerrarModalPlacas = () => {
    if (guardandoPlacas) return;
    setRecursoPlacasModal(null);
    setConfirmacionPlacasAbierta(false);
    setNuevaPlacaInput("");
  };
  const cambiosPlacasDetectados = useMemo<CambioPlacaItem[]>(() => {
    const cambios: CambioPlacaItem[] = [];
    const maxLen = Math.max(placasOriginalesModal.length, placasEditadasModal.length);
    for (let i = 0; i < maxLen; i++) {
      const ant = (placasOriginalesModal[i] ?? "").trim();
      const nue = (placasEditadasModal[i] ?? "").trim();
      if (ant !== nue) {
        cambios.push({ indice: i, anterior: ant, nueva: nue });
      }
    }
    return cambios;
  }, [placasOriginalesModal, placasEditadasModal]);
  const agregarPlacaEnModal = () => {
    const limpia = nuevaPlacaInput.trim();
    if (!limpia) return;
    const existe = placasEditadasModal.some((p) => p.toUpperCase() === limpia.toUpperCase());
    if (existe) {
      toast.error(`La placa "${limpia}" ya está en la lista de este dispositivo.`);
      return;
    }
    const siguiente = [...placasEditadasModal, limpia];
    setPlacasEditadasModal(siguiente);
    setIndiceSeleccionadoModal(siguiente.length - 1);
    setNuevaPlacaInput("");
  };
  const eliminarPlacaEnModal = (idx: number) => {
    const siguiente = placasEditadasModal.filter((_, i) => i !== idx);
    setPlacasEditadasModal(siguiente);
    setIndiceSeleccionadoModal((prev) => Math.max(0, Math.min(prev, siguiente.length - 1)));
  };
  const validarYConfirmarPlacas = () => {
    const pendiente = nuevaPlacaInput.trim();
    const listaBase = [...placasEditadasModal];
    if (pendiente) {
      if (listaBase.some((p) => p.trim().toUpperCase() === pendiente.toUpperCase())) {
        toast.error(`La placa "${pendiente}" ya está en la lista de este dispositivo.`);
        return;
      }
      listaBase.push(pendiente);
      setPlacasEditadasModal(listaBase);
      setIndiceSeleccionadoModal(listaBase.length - 1);
      setNuevaPlacaInput("");
    }
    const limpias = listaBase.map((p) => p.trim()).filter(Boolean);
    const vistas = new Set<string>();
    for (const p of limpias) {
      const up = p.toUpperCase();
      if (vistas.has(up)) {
        toast.error(`La placa "${p}" está repetida en este dispositivo.`);
        return;
      }
      vistas.add(up);
    }
    // Verificar que no exista en otro recurso del inventario
    for (const otro of q.data?.recursos ?? []) {
      if (otro.id === recursoPlacasModal?.id) continue;
      const placasOtro = parsePlacas(otro.numero_inventario);
      for (const p of limpias) {
        if (placasOtro.some((po) => po.toUpperCase() === p.toUpperCase())) {
          toast.error(`La placa "${p}" ya está asignada a "${corregirNombreTorso(otro.name)}".`);
          return;
        }
      }
    }
    const hayCambios =
      limpias.length !== placasOriginalesModal.length ||
      limpias.some((p, idx) => p !== (placasOriginalesModal[idx] ?? "").trim());
    if (!hayCambios) {
      toast.info("No hay cambios pendientes en las placas.");
      return;
    }
    setConfirmacionPlacasAbierta(true);
  };
  const ejecutarGuardadoPlacasGlobal = async () => {
    if (!recursoPlacasModal) return;
    setGuardandoPlacas(true);
    try {
      const limpias = placasEditadasModal.map((p) => p.trim()).filter(Boolean);
      const nuevoInvStr = limpias.join(", ");
      const nuevoCode = limpias[0] ?? null;
      // 1. Actualizar el recurso en tabla resources
      const { error: errUpdateRes } = await supabase
        .from("resources")
        .update({
          numero_inventario: nuevoInvStr || null,
          code: nuevoCode,
        })
        .eq("id", recursoPlacasModal.id);
      if (errUpdateRes) throw errUpdateRes;
      // 2. Propagar reemplazos de placas en toda la base de datos (reservas, préstamos y trazabilidad)
      const reemplazos = cambiosPlacasDetectados.filter((c) => c.anterior && c.nueva && c.anterior !== c.nueva);
      let reservasActualizadas = 0;
      if (reemplazos.length > 0) {
        const { data: todasReservas, error: errRes } = await supabase
          .from("reservations")
          .select("id, notes, falta_equipo");
        if (errRes) throw errRes;
        for (const rev of todasReservas ?? []) {
          let notasNuevas = rev.notes ?? "";
          let faltaNueva = rev.falta_equipo ?? "";
          let modificada = false;
          for (const rep of reemplazos) {
            if (notasNuevas) {
              const cand = reemplazarTokenPlaca(notasNuevas, rep.anterior, rep.nueva);
              if (cand !== notasNuevas) {
                notasNuevas = cand;
                modificada = true;
              }
            }
            if (faltaNueva) {
              const candFalta = reemplazarTokenPlaca(faltaNueva, rep.anterior, rep.nueva);
              if (candFalta !== faltaNueva) {
                faltaNueva = candFalta;
                modificada = true;
              }
            }
          }
          if (modificada) {
            const { error: errRevUpd } = await supabase
              .from("reservations")
              .update({
                notes: notasNuevas || null,
                falta_equipo: faltaNueva || null,
              })
              .eq("id", rev.id);
            if (errRevUpd) throw errRevUpd;
            reservasActualizadas++;
          }
        }
      }
      toast.success(
        reservasActualizadas > 0
          ? `Placas actualizadas y sincronizadas en ${reservasActualizadas} reserva(s)/préstamo(s).`
          : "Placas actualizadas correctamente en el inventario."
      );
      setConfirmacionPlacasAbierta(false);
      setRecursoPlacasModal(null);
      q.refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudieron actualizar las placas.";
      toast.error(msg);
    } finally {
      setGuardandoPlacas(false);
    }
  };
  const abrirModalDescripcion = (r: Row) => {
    setRecursoDescModal(r);
    setTextoDescModal(r.descripcion ?? "");
  };
  const guardarDescripcionModal = async () => {
    if (!recursoDescModal) return;
    setGuardandoDesc(true);
    try {
      const limpia = textoDescModal.trim();
      const { error } = await supabase
        .from("resources")
        .update({ descripcion: limpia || null })
        .eq("id", recursoDescModal.id);
      if (error) throw error;
      toast.success("Descripción actualizada");
      setRecursoDescModal(null);
      q.refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la descripción");
    } finally {
      setGuardandoDesc(false);
    }
  };
  const sincronizarDesdeExcel = async () => {
    setSincronizando(true);
    try {
      const [{ data: existentes, error: errRes }, { data: cats, error: errCat }] = await Promise.all([
        supabase.from("resources").select("id, name, code, numero_inventario, descripcion, quantity_total, category_id"),
        supabase.from("resource_categories").select("id, kind, name"),
      ]);
      if (errRes) throw errRes;
      if (errCat) throw errCat;
      const catSimulador = (cats ?? []).find((c) => c.kind === "SIMULADOR")?.id ?? (cats ?? [])[0]?.id;
      const catEquipo = (cats ?? []).find((c) => c.kind === "EQUIPO")?.id ?? catSimulador;
      if (!catSimulador) {
        toast.error("No hay categorías de recursos configuradas en la base de datos.");
        return;
      }
      const listaActual = [...(existentes ?? [])];
      const placasGlobales = new Set<string>();
      for (const r of listaActual) {
        for (const p of parsePlacas(r.numero_inventario)) {
          placasGlobales.add(p.toUpperCase());
        }
      }
      let actualizados = 0;
      let creados = 0;
      let sinCambios = 0;
      for (const item of INVENTARIO_EXCEL) {
        const claveExcel = normalizarClave(item.nombre);
        const placasSetExcel = new Set(item.placas.map((p) => p.toUpperCase()));
        let match = listaActual.find((r) => {
          const placasReg = parsePlacas(r.numero_inventario);
          return placasReg.some((p) => placasSetExcel.has(p.toUpperCase()));
        });
        if (!match) {
          match = listaActual.find((r) => normalizarClave(r.name) === claveExcel);
        }
        if (match) {
          const placasActuales = parsePlacas(match.numero_inventario);
          const placasActualesUpper = new Set(placasActuales.map((p) => p.toUpperCase()));
          const nuevasPlacas = [...placasActuales];
          let agregoPlaca = false;
          for (const p of item.placas) {
            const up = p.toUpperCase();
            if (!placasActualesUpper.has(up) && !placasGlobales.has(up)) {
              nuevasPlacas.push(p);
              placasActualesUpper.add(up);
              placasGlobales.add(up);
              agregoPlaca = true;
            }
          }
          const nombreCorregido = corregirNombreTorso(match.name);
          const nuevoInvStr = nuevasPlacas.join(", ");
          const nuevaDesc = (match.descripcion ?? "").trim() ? match.descripcion : item.descripcion;
          const nuevaCant = Math.max(Number(match.quantity_total ?? 0), nuevasPlacas.length);
          const cambioNombre = nombreCorregido !== match.name;
          const cambioInv = nuevoInvStr !== (match.numero_inventario ?? "").trim();
          const cambioDesc = (nuevaDesc ?? "") !== (match.descripcion ?? "");
          const cambioCant = nuevaCant !== Number(match.quantity_total ?? 0);
          if (agregoPlaca || cambioNombre || cambioInv || cambioDesc || cambioCant) {
            const { error } = await supabase
              .from("resources")
              .update({
                name: nombreCorregido,
                numero_inventario: nuevoInvStr || null,
                descripcion: nuevaDesc || null,
                quantity_total: nuevaCant,
              })
              .eq("id", match.id);
            if (error) throw error;
            match.name = nombreCorregido;
            match.numero_inventario = nuevoInvStr;
            match.descripcion = nuevaDesc;
            match.quantity_total = nuevaCant;
            actualizados++;
          } else {
            sinCambios++;
          }
        } else {
          const placasParaCrear: string[] = [];
          for (const p of item.placas) {
            const up = p.toUpperCase();
            if (!placasGlobales.has(up)) {
              placasParaCrear.push(p);
              placasGlobales.add(up);
            }
          }
          if (placasParaCrear.length === 0) {
            sinCambios++;
            continue;
          }
          const payload = {
            name: item.nombre,
            category_id: item.kind === "SIMULADOR" ? catSimulador : catEquipo!,
            numero_inventario: placasParaCrear.join(", "),
            code: placasParaCrear[0] ?? null,
            descripcion: item.descripcion || null,
            quantity_total: placasParaCrear.length,
            maintenance_quantity: 0,
            out_of_service_quantity: 0,
            status: "DISPONIBLE" as const,
            allows_external_exit: true,
          };
          const { data: insertado, error } = await supabase
            .from("resources")
            .insert(payload)
            .select("id, name, code, numero_inventario, descripcion, quantity_total, category_id")
            .single();
          if (error) throw error;
          if (insertado) listaActual.push(insertado);
          creados++;
        }
      }
      toast.success(
        `Sincronización completada: ${actualizados} actualizado(s), ${creados} nuevo(s), ${sinCambios} sin cambios.`
      );
      q.refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo sincronizar el inventario.";
      toast.error(msg);
    } finally {
      setSincronizando(false);
    }
  };
  const { recursosFiltrados, esAproximado } = useMemo(() => {
    const todos = q.data?.recursos ?? [];
    const consulta = filtroAplicado.trim();
    if (!consulta) return { recursosFiltrados: todos, esAproximado: false };
    const evaluados = todos
      .map((r: Row) => ({ r, ...evaluarCoincidencia(consulta, r) }))
      .filter((x) => x.score > 0);
    const exactos = evaluados.filter((x) => x.exacta).sort((a, b) => b.score - a.score);
    if (exactos.length > 0) {
      return { recursosFiltrados: exactos.map((x) => x.r), esAproximado: false };
    }
    const aproximados = evaluados.sort((a, b) => b.score - a.score);
    return { recursosFiltrados: aproximados.map((x) => x.r), esAproximado: aproximados.length > 0 };
  }, [q.data?.recursos, filtroAplicado]);
  const ejecutarBusqueda = (e?: React.FormEvent) => {
    e?.preventDefault();
    setFiltroAplicado(textoBusqueda.trim());
  };
  const limpiarBusqueda = () => {
    setTextoBusqueda("");
    setFiltroAplicado("");
  };
  useEffect(() => {
    const topEl = topScrollRef.current;
    const topInner = topInnerRef.current;
    const container = tableContainerRef.current;
    if (!topEl || !topInner || !container) return;
    const tableEl = container.querySelector("table");
    const innerScroller =
      tableEl?.parentElement && tableEl.parentElement !== container
        ? tableEl.parentElement
        : container;
    const updateWidth = () => {
      const scrollW = tableEl ? tableEl.scrollWidth : innerScroller.scrollWidth;
      const clientW = innerScroller.clientWidth;
      topInner.style.width = `${scrollW}px`;
      topEl.style.display = scrollW > clientW + 1 ? "block" : "none";
    };
    const onTopScroll = () => {
      if (Math.abs(innerScroller.scrollLeft - topEl.scrollLeft) > 1) {
        innerScroller.scrollLeft = topEl.scrollLeft;
      }
    };
    const onBottomScroll = () => {
      if (Math.abs(topEl.scrollLeft - innerScroller.scrollLeft) > 1) {
        topEl.scrollLeft = innerScroller.scrollLeft;
      }
    };
    updateWidth();
    topEl.addEventListener("scroll", onTopScroll, { passive: true });
    innerScroller.addEventListener("scroll", onBottomScroll, { passive: true });
    const ro = new ResizeObserver(updateWidth);
    ro.observe(innerScroller);
    if (tableEl) ro.observe(tableEl);
    return () => {
      topEl.removeEventListener("scroll", onTopScroll);
      innerScroller.removeEventListener("scroll", onBottomScroll);
      ro.disconnect();
    };
  }, [recursosFiltrados]);
  return (
    <TooltipProvider delayDuration={120}>
      <div>
        <Titulo t="Inventario y quirófano" d="Cantidades por estado; lo reservado se calcula solo con las reservas aprobadas" />
        <Tabs defaultValue="recursos">
          <TabsList>
            <TabsTrigger value="recursos">Recursos</TabsTrigger>
            <TabsTrigger value="quirofano">Quirófano</TabsTrigger>
            <TabsTrigger value="chequeo">Lista de chequeo</TabsTrigger>
          </TabsList>
          <TabsContent value="recursos" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <form onSubmit={ejecutarBusqueda} className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    value={textoBusqueda}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTextoBusqueda(val);
                      if (!val.trim()) setFiltroAplicado("");
                    }}
                    placeholder="Buscar recurso, insumo, descripción o placa..."
                    className="pl-9 pr-8 bg-background"
                  />
                  {textoBusqueda && (
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
                <Button type="submit" size="sm">
                  <Search className="h-4 w-4 mr-1.5" />
                  Buscar
                </Button>
                {filtroAplicado && (
                  <Button type="button" size="sm" variant="outline" onClick={limpiarBusqueda}>
                    Ver todos
                  </Button>
                )}
              </form>
              
            </div>
            {filtroAplicado && (
              <p className="text-xs text-muted-foreground">
                {recursosFiltrados.length === 0
                  ? `No se encontraron recursos parecidos a "${filtroAplicado}".`
                  : esAproximado
                    ? `Mostrando ${recursosFiltrados.length} resultado(s) más parecidos a "${filtroAplicado}":`
                    : `Mostrando ${recursosFiltrados.length} resultado(s) para "${filtroAplicado}":`}
              </p>
            )}
            <Card className="overflow-hidden">
              <div className="border-b bg-muted/30 pt-1 pb-0.5">
                <div
                  ref={topScrollRef}
                  className="overflow-x-auto overflow-y-hidden"
                  aria-label="Desplazamiento horizontal superior"
                >
                  <div ref={topInnerRef} className="h-1" />
                </div>
              </div>
              <CardContent
                ref={tableContainerRef}
                className="p-0 [&>div]:max-h-[calc(100vh-16.5rem)] [&>div]:min-h-[340px] [&>div]:overflow-auto"
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow className="hover:bg-muted">
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap">Recurso</TableHead>
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap">N° inventario / Placas</TableHead>
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap">Descripción</TableHead>
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap">Tipo</TableHead>
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap text-right">Total</TableHead>
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap">Mantenimiento</TableHead>
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap">Fuera de servicio</TableHead>
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap text-right">Reservados activos</TableHead>
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap text-right">Disponible</TableHead>
                      <TableHead className="bg-muted font-semibold text-foreground whitespace-nowrap text-center">Trazabilidad / Estados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recursosFiltrados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-6 text-sm text-muted-foreground">
                          No hay elementos que coincidan con la búsqueda.
                        </TableCell>
                      </TableRow>
                    )}
                    {recursosFiltrados.map((r: Row) => {
                      const res = q.data?.reservados[r.id] ?? 0;
                      const bloqueado = r.status !== "DISPONIBLE";
                      const disp = bloqueado
                        ? 0
                        : Math.max(0, r.quantity_total - r.maintenance_quantity - r.out_of_service_quantity - res);
                      const placas = parsePlacas(r.numero_inventario);
                      const nombreMostrar = corregirNombreTorso(String(r.name ?? ""));
                      const descTexto = String(r.descripcion ?? "").trim();
                      const num = (k: "maintenance_quantity" | "out_of_service_quantity") => (
                        <Input
                          type="number"
                          min={0}
                          max={r.quantity_total}
                          defaultValue={r[k]}
                          className="h-8 w-20"
                          onBlur={(e) => {
                            const v = Math.max(0, +e.target.value || 0);
                            if (v !== r[k]) cambiar(r.id, { [k]: v });
                          }}
                        />
                      );
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {nombreMostrar}
                            {r.allows_external_exit && (
                              <span className="ml-2 text-xs text-muted-foreground">(sale de la Facultad)</span>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[200px] max-w-[260px]">
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex flex-wrap gap-1">
                                {placas.length > 0 ? (
                                  placas.map((pl) => (
                                    <span
                                      key={pl}
                                      className="inline-flex items-center rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                                    >
                                      {pl}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs italic text-muted-foreground">Sin placa</span>
                                )}
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => abrirModalPlacas(r)}
                                    aria-label="Gestionar placas"
                                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Gestionar placas de este dispositivo
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[190px] max-w-[250px]">
                            <div className="flex items-center justify-between gap-1.5">
                              {descTexto ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="block truncate text-xs text-foreground cursor-help">
                                      {descTexto}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-sm whitespace-normal text-xs leading-relaxed">
                                    <p className="font-semibold mb-0.5">{nombreMostrar}</p>
                                    <p>{descTexto}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-xs italic text-muted-foreground">Sin descripción</span>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => abrirModalDescripcion(r)}
                                    aria-label="Editar descripción"
                                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Editar descripción
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                          <TableCell>{KIND[r.resource_categories?.kind] ?? r.resource_categories?.name}</TableCell>
                          <TableCell className="text-right">{r.quantity_total}</TableCell>
                          <TableCell>{num("maintenance_quantity")}</TableCell>
                          <TableCell>{num("out_of_service_quantity")}</TableCell>
                          <TableCell className="text-right">{res}</TableCell>
                          <TableCell className={`text-right font-semibold ${disp === 0 ? "text-destructive" : "text-primary"}`}>
                            {disp}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => setRecursoEstadosModal(r)}
                            >
                              Ver estados
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="quirofano" className="grid gap-4 md:grid-cols-2">
            {q.data?.kits.length === 0 && <p className="text-sm text-muted-foreground">No hay kits registrados.</p>}
            {q.data?.kits.map((k: Row) => {
              const faltan = (k.total_piezas ?? 0) - (k.piezas_disponibles ?? 0);
              const piezas = (Array.isArray(k.piezas) ? k.piezas : []) as Row[];
              return (
                <Card key={k.kit_id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex justify-between gap-2">
                      {k.kit_name}
                      <EstadoBadge status={k.kit_status} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p>
                      {k.piezas_disponibles}/{k.total_piezas} pinzas disponibles
                    </p>
                    {faltan > 0 && (
                      <p className="rounded-md bg-destructive/10 text-destructive px-2 py-1 text-xs">
                        Alerta: faltan {faltan} pieza(s) para completar el paquete
                      </p>
                    )}
                    <ul className="text-xs space-y-0.5">
                      {piezas.map((p, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{p.name ?? p.nombre}</span>
                          <EstadoBadge status={p.status ?? p.estado} />
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
          <TabsContent value="chequeo">
            <ListaChequeo />
          </TabsContent>
        </Tabs>
        {/* Modal de edición individual de placas */}
        <Dialog open={Boolean(recursoPlacasModal)} onOpenChange={(open) => !open && cerrarModalPlacas()}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Gestión de placas / N° de inventario</DialogTitle>
              <DialogDescription>
                {recursoPlacasModal ? corregirNombreTorso(String(recursoPlacasModal.name ?? "")) : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">
                  Placas actuales ({placasEditadasModal.length}) — selecciona cuál deseas modificar:
                </Label>
                {placasEditadasModal.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Este dispositivo aún no tiene placas registradas. Agrega una abajo.
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border p-2">
                    {placasEditadasModal.map((placa, idx) => {
                      const seleccionada = indiceSeleccionadoModal === idx;
                      const original = placasOriginalesModal[idx];
                      const modificada = original !== undefined && original !== placa.trim();
                      return (
                        <div
                          key={idx}
                          onClick={() => setIndiceSeleccionadoModal(idx)}
                          className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors cursor-pointer ${
                            seleccionada ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="placa_seleccionada"
                            checked={seleccionada}
                            onChange={() => setIndiceSeleccionadoModal(idx)}
                            aria-label={`Seleccionar placa ${idx + 1}`}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
                            Unidad #{idx + 1}
                          </span>
                          <Input
                            value={placa}
                            onFocus={() => setIndiceSeleccionadoModal(idx)}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPlacasEditadasModal((prev) =>
                                prev.map((item, i) => (i === idx ? val : item))
                              );
                            }}
                            placeholder="N° de inventario / placa"
                            className="h-8 font-mono text-xs"
                          />
                          {modificada && (
                            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              Antes: {original}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              eliminarPlacaEnModal(idx);
                            }}
                            title="Quitar esta placa"
                            aria-label="Quitar esta placa"
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nueva-placa-input" className="text-xs font-semibold">
                  Agregar nueva placa al dispositivo
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="nueva-placa-input"
                    value={nuevaPlacaInput}
                    onChange={(e) => setNuevaPlacaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        agregarPlacaEnModal();
                      }
                    }}
                    placeholder="Ej. 150723-5"
                    className="h-8 font-mono text-xs"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={agregarPlacaEnModal} className="h-8">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar
                  </Button>
                </div>
              </div>
              {confirmacionPlacasAbierta && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">¿Está seguro de hacer este cambio?</p>
                      <p className="text-amber-900">
                        Al confirmar, la placa se actualizará en el inventario y en todas las reservas o préstamos donde esté registrado este dispositivo para conservar la trazabilidad:
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
                        {cambiosPlacasDetectados.map((c, i) => (
                          <li key={i}>
                            {c.anterior && c.nueva
                              ? `${c.anterior} -> ${c.nueva}`
                              : c.nueva
                                ? `Nueva placa: ${c.nueva}`
                                : `Eliminada: ${c.anterior}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={guardandoPlacas}
                      onClick={() => setConfirmacionPlacasAbierta(false)}
                      className="h-7 text-xs bg-white"
                    >
                      Volver
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={guardandoPlacas}
                      onClick={ejecutarGuardadoPlacasGlobal}
                      className="h-7 text-xs"
                    >
                      {guardandoPlacas ? "Actualizando..." : "Sí, confirmar cambio"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {!confirmacionPlacasAbierta && (
              <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={cerrarModalPlacas}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" onClick={validarYConfirmarPlacas}>
                  Guardar cambios
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
        {/* Modal de edición de descripción */}
        <Dialog open={Boolean(recursoDescModal)} onOpenChange={(open) => !open && setRecursoDescModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Descripción del dispositivo</DialogTitle>
              <DialogDescription>
                {recursoDescModal ? corregirNombreTorso(String(recursoDescModal.name ?? "")) : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="desc-textarea" className="text-xs">
                Detalle técnico o uso del equipo
              </Label>
              <Textarea
                id="desc-textarea"
                rows={4}
                value={textoDescModal}
                onChange={(e) => setTextoDescModal(e.target.value)}
                placeholder="Escribe la descripción completa del equipo o simulador..."
                className="text-xs"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setRecursoDescModal(null)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" disabled={guardandoDesc} onClick={guardarDescripcionModal}>
                {guardandoDesc ? "Guardando..." : "Guardar descripción"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}