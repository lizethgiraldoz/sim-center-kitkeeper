import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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
  head: () => ({ meta: [{ title: "Inventario y quirófano · Centro de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});

const ESTADOS = ["DISPONIBLE", "EN_MANTENIMIENTO", "FUERA_DE_SERVICIO"] as const;
const KIND: Record<string, string> = { EQUIPO: "Equipo", SIMULADOR: "Simulador", INSUMO: "Insumo", PAQUETE_QUIRURGICO: "Paquete quirúrgico" };

function Page() {
  const q = useQuery({
    queryKey: ["inventario"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const [r, k, a] = await Promise.all([
        supabase.from("resources").select("*, resource_categories(name, kind)").order("name"),
        supabase.from("quirofano_instrumental").select("*"),
        supabase.from("reservation_resources").select("resource_id, quantity, cantidad_aprobada, reservations!inner(status, ends_at)")
          .in("reservations.status", ["APROBADA", "EN_CURSO"]).gte("reservations.ends_at", now),
      ]);
      const reservados: Record<string, number> = {};
      (a.data ?? []).forEach((x: Row) => { reservados[x.resource_id] = (reservados[x.resource_id] ?? 0) + (x.cantidad_aprobada ?? x.quantity); });
      return { recursos: r.data ?? [], kits: k.data ?? [], reservados };
    },
  });
  const cambiar = async (id: string, patch: { status?: (typeof ESTADOS)[number]; maintenance_quantity?: number; out_of_service_quantity?: number }) => {
    const { error } = await supabase.from("resources").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Estado actualizado"); q.refetch(); }
  };
  return (
    <div>
      <Titulo t="Inventario y quirófano" d="Cantidades por estado; lo reservado se calcula solo con las reservas aprobadas" />
      <Tabs defaultValue="recursos">
        <TabsList><TabsTrigger value="recursos">Recursos</TabsTrigger><TabsTrigger value="quirofano">Quirófano</TabsTrigger><TabsTrigger value="chequeo">Lista de chequeo</TabsTrigger></TabsList>
        <TabsContent value="recursos">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Recurso</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Mantenimiento</TableHead><TableHead>Fuera de servicio</TableHead><TableHead className="text-right">Reservados activos</TableHead><TableHead className="text-right">Disponible</TableHead><TableHead>Estado general</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.data?.recursos.map((r: Row) => {
                  const res = q.data.reservados[r.id] ?? 0;
                  const bloqueado = r.status !== "DISPONIBLE";
                  const disp = bloqueado ? 0 : Math.max(0, r.quantity_total - r.maintenance_quantity - r.out_of_service_quantity - res);
                  const num = (k: "maintenance_quantity" | "out_of_service_quantity") => (
                    <Input type="number" min={0} max={r.quantity_total} defaultValue={r[k]} className="h-8 w-20"
                      onBlur={(e) => { const v = Math.max(0, +e.target.value || 0); if (v !== r[k]) cambiar(r.id, { [k]: v }); }} />
                  );
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}{r.allows_external_exit && <span className="ml-2 text-xs text-muted-foreground">(sale de la Facultad)</span>}</TableCell>
                      <TableCell>{KIND[r.resource_categories?.kind] ?? r.resource_categories?.name}</TableCell>
                      <TableCell className="text-right">{r.quantity_total}</TableCell>
                      <TableCell>{num("maintenance_quantity")}</TableCell>
                      <TableCell>{num("out_of_service_quantity")}</TableCell>
                      <TableCell className="text-right">{res}</TableCell>
                      <TableCell className={`text-right font-semibold ${disp === 0 ? "text-destructive" : "text-primary"}`}>{disp}</TableCell>
                      <TableCell>
                        <select className="border rounded-md h-8 px-1 text-xs bg-background text-foreground" value={ESTADOS.includes(r.status) ? r.status : "DISPONIBLE"} onChange={(e) => cambiar(r.id, { status: e.target.value as (typeof ESTADOS)[number] })}>
                          {ESTADOS.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
                        </select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="quirofano" className="grid gap-4 md:grid-cols-2">
          {q.data?.kits.length === 0 && <p className="text-sm text-muted-foreground">No hay kits registrados.</p>}
          {q.data?.kits.map((k: Row) => {
            const faltan = (k.total_piezas ?? 0) - (k.piezas_disponibles ?? 0);
            const piezas = (Array.isArray(k.piezas) ? k.piezas : []) as Row[];
            return (
              <Card key={k.kit_id}>
                <CardHeader className="pb-2"><CardTitle className="text-base flex justify-between gap-2">{k.kit_name}<EstadoBadge status={k.kit_status} /></CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>{k.piezas_disponibles}/{k.total_piezas} pinzas disponibles</p>
                  {faltan > 0 && <p className="rounded-md bg-destructive/10 text-destructive px-2 py-1 text-xs">Alerta: faltan {faltan} pieza(s) para completar el paquete</p>}
                  <ul className="text-xs space-y-0.5">
                    {piezas.map((p, i) => <li key={i} className="flex justify-between"><span>{p.name ?? p.nombre}</span><EstadoBadge status={p.status ?? p.estado} /></li>)}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
        <TabsContent value="chequeo"><ListaChequeo /></TabsContent>
      </Tabs>
    </div>
  );
}
