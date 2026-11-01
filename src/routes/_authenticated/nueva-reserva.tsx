import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormularioReserva } from "@/components/FormularioReserva";
import { Titulo } from "@/components/SoloAdmin";
import { useCatalogos } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/nueva-reserva")({
  head: () => ({ meta: [{ title: "Nueva reserva · Laboratorio de Simulación UdeA" }] }),
  component: Page,
});

function Page() {
  const { data } = useCatalogos();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <div className="max-w-5xl">
      <Titulo t="Nueva reserva" d="Formato oficial F-CS-01 · al elegir el módulo se precargan los equipos e insumos" />
      <FormularioReserva spaces={data?.spaces ?? []} activities={data?.activities ?? []}
        onDone={(m) => { toast.success(m); qc.invalidateQueries({ queryKey: ["reservas"] }); navigate({ to: "/mis-solicitudes" }); }} />
    </div>
  );
}
