import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  // Búsqueda aproximada por similitud ortográfica (errores de tipeo / letras omitidas o duplicadas)
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
function Page() {
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [filtroAplicado, setFiltroAplicado] = useState("");
  const topScrollRef = useRef<HTMLDivElement>(null);
  const topInnerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ["inventario"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const [r, k, a] = await Promise.all([
        supabase.from("resources").select("*, resource_categories(name, kind)").order("name"),
        supabase.from("quirofano_instrumental").select("*"),
        supabase
          .from("reservation_resources")
          .select("resource_id, quantity, cantidad_aprobada, reservations!inner(status, ends_at)")
          .in("reservations.status", ["APROBADA", "EN_CURSO"])
          .gte("reservations.ends_at", now),
      ]);
      const reservados: Record<string, number> = {};
      (a.data ?? []).forEach((x: Row) => {
        reservados[x.resource_id] = (reservados[x.resource_id] ?? 0) + (x.cantidad_aprobada ?? x.quantity);
      });
      return { recursos: r.data ?? [], kits: k.data ?? [], reservados };
    },
  });
  const cambiar = async (
    id: string,
    patch: {
      status?: (typeof ESTADOS)[number];
      maintenance_quantity?: number;
      out_of_service_quantity?: number;
      numero_inventario?: string;
      descripcion?: string;
    }
  ) => {
    const { error } = await supabase.from("resources").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Estado actualizado");
      q.refetch();
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
    <div>
      <Titulo t="Inventario y quirófano" d="Cantidades por estado; lo reservado se calcula solo con las reservas aprobadas" />
      <Tabs defaultValue="recursos">
        <TabsList>
          <TabsTrigger value="recursos">Recursos</TabsTrigger>
          <TabsTrigger value="quirofano">Quirófano</TabsTrigger>
          <TabsTrigger value="chequeo">Lista de chequeo</TabsTrigger>
        </TabsList>
        <TabsContent value="recursos" className="space-y-3">
          <form onSubmit={ejecutarBusqueda} className="flex flex-wrap items-center gap-2">
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
          {filtroAplicado && (
            <p className="text-xs text-muted-foreground">
              {recursosFiltrados.length === 0
                ? `No se encontraron recursos parecidos a "${filtroAplicado}".`
                : esAproximado
                  ? `Mostrando ${recursosFiltrados.length} resultado(s) más parecidos a "${filtroAplicado}":`
                  : `Mostrando ${recursosFiltrados.length} resultado(s) para "${filtroAplicado}":`}
            </p>
          )}
          <Card>
            <div
              ref={topScrollRef}
              className="sticky top-0 z-20 overflow-x-auto overflow-y-hidden border-b bg-card"
            >
              <div ref={topInnerRef} className="h-px" />
            </div>
            <CardContent ref={tableContainerRef} className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recurso</TableHead>
                    <TableHead>N° inventario</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Mantenimiento</TableHead>
                    <TableHead>Fuera de servicio</TableHead>
                    <TableHead className="text-right">Reservados activos</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead>Estado general</TableHead>
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
                          {r.name}
                          {r.allows_external_exit && (
                            <span className="ml-2 text-xs text-muted-foreground">(sale de la Facultad)</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            defaultValue={r.numero_inventario ?? ""}
                            placeholder="Placa / serial"
                            className="h-8 w-28 text-xs"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (r.numero_inventario ?? "")) cambiar(r.id, { numero_inventario: v });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            defaultValue={r.descripcion ?? ""}
                            placeholder="Descripción"
                            className="h-8 w-44 text-xs"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (r.descripcion ?? "")) cambiar(r.id, { descripcion: v });
                            }}
                          />
                        </TableCell>
                        <TableCell>{KIND[r.resource_categories?.kind] ?? r.resource_categories?.name}</TableCell>
                        <TableCell className="text-right">{r.quantity_total}</TableCell>
                        <TableCell>{num("maintenance_quantity")}</TableCell>
                        <TableCell>{num("out_of_service_quantity")}</TableCell>
                        <TableCell className="text-right">{res}</TableCell>
                        <TableCell className={`text-right font-semibold ${disp === 0 ? "text-destructive" : "text-primary"}`}>
                          {disp}
                        </TableCell>
                        <TableCell>
                          <select
                            className="border rounded-md h-8 px-1 text-xs bg-background text-foreground"
                            value={ESTADOS.includes(r.status) ? r.status : "DISPONIBLE"}
                            onChange={(e) => cambiar(r.id, { status: e.target.value as (typeof ESTADOS)[number] })}
                          >
                            {ESTADOS.map((s) => (
                              <option key={s} value={s}>
                                {s.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
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
    </div>
  );
}