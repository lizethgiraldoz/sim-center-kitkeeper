import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SoloAdmin, Titulo } from "@/components/SoloAdmin";
import { fmt, type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/docentes")({
  head: () => ({ meta: [{ title: "Verificación de docentes · Laboratorio de Simulación UdeA" }] }),
  component: () => <SoloAdmin><Page /></SoloAdmin>,
});

const ETQ: Record<string, string> = { PENDIENTE: "bg-warning text-warning-foreground", VERIFICADA: "bg-success text-success-foreground", RECHAZADA: "bg-destructive text-destructive-foreground" };

function Page() {
  const q = useQuery({
    queryKey: ["docentes"],
    queryFn: async () => (await supabase.from("profiles").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const set = async (id: string, estado: string) => {
    const { error } = await supabase.rpc("verificar_docente", { _id: id, _estado: estado });
    if (error) toast.error(error.message); else { toast.success("Cuenta actualizada"); q.refetch(); }
  };
  const rows = [...(q.data ?? [])].sort((a: Row, b: Row) => Number(b.estado_cuenta === "PENDIENTE") - Number(a.estado_cuenta === "PENDIENTE"));
  return (
    <div className="max-w-4xl">
      <Titulo t="Verificación de docentes" d="Las cuentas nuevas quedan pendientes hasta que el administrador las apruebe" />
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No hay cuentas registradas.</p>}
        {rows.map((p: Row) => (
          <Card key={p.id}><CardContent className="p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48">
              <p className="font-semibold">{p.full_name || p.email}</p>
              <p className="text-xs text-muted-foreground">{p.email} · registrado {fmt(p.created_at)}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ETQ[p.estado_cuenta] ?? ""}`}>{p.estado_cuenta}</span>
            {p.estado_cuenta !== "VERIFICADA" && <Button size="sm" onClick={() => set(p.id, "VERIFICADA")}>Aprobar</Button>}
            {p.estado_cuenta !== "RECHAZADA" && <Button size="sm" variant="destructive" onClick={() => set(p.id, "RECHAZADA")}>Rechazar</Button>}
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
