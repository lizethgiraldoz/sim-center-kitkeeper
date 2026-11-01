import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { FormularioReserva } from "@/components/FormularioReserva";
import { Titulo } from "@/components/SoloAdmin";
import { useCatalogos, useSessionUser } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/nueva-reserva")({
  head: () => ({ meta: [{ title: "Nueva reserva · Laboratorio de Simulación UdeA" }] }),
  component: Page,
});

function Page() {
  const { data } = useCatalogos();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useSessionUser();
  const perfil = useQuery({ queryKey: ["mi-perfil", me?.id], enabled: !!me?.id,
    queryFn: async () => (await supabase.from("profiles").select("estado_cuenta").eq("id", me!.id).maybeSingle()).data });
  if (me && !me.isAdmin && perfil.data && perfil.data.estado_cuenta !== "VERIFICADA")
    return <Alert className="max-w-xl"><AlertTitle>{perfil.data.estado_cuenta === "RECHAZADA" ? "Cuenta rechazada" : "Cuenta pendiente de verificación"}</AlertTitle>
      <AlertDescription>{perfil.data.estado_cuenta === "RECHAZADA" ? "El administrador no aprobó tu cuenta. Comunícate con el Laboratorio de Simulación." : "El administrador debe aprobar tu cuenta antes de que puedas enviar reservas."}</AlertDescription></Alert>;
  return (
    <div className="max-w-5xl">
      <Titulo t="Nueva reserva" d="Formato oficial F-CS-01 · al elegir el módulo se precargan los equipos e insumos" />
      <FormularioReserva spaces={data?.spaces ?? []} activities={data?.activities ?? []}
        onDone={(m) => { toast.success(m); qc.invalidateQueries({ queryKey: ["reservas"] }); navigate({ to: "/mis-solicitudes" }); }} />
    </div>
  );
}
