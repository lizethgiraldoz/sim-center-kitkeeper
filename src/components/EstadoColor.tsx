import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Convención de colores: verde libre, azul reservado/en uso, naranja mantenimiento, rojo fuera de servicio. */
export const COLOR_ESTADO = {
  DISPONIBLE: { cls: "bg-success", label: "Libre / Disponible" },
  RESERVADO: { cls: "bg-info", label: "Reservado / En uso" },
  EN_MANTENIMIENTO: { cls: "bg-orange", label: "En mantenimiento" },
  FUERA_DE_SERVICIO: { cls: "bg-destructive", label: "Fuera de servicio" },
} as const;
export type EstadoColorKey = keyof typeof COLOR_ESTADO;

export function PuntoEstado({ status, extra }: { status: EstadoColorKey; extra?: string }) {
  const c = COLOR_ESTADO[status] ?? COLOR_ESTADO.DISPONIBLE;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild><span role="img" aria-label={c.label} className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-background ${c.cls}`} /></TooltipTrigger>
        <TooltipContent>{c.label}{extra ? ` · ${extra}` : ""}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function LeyendaColores() {
  return <div className="flex gap-2 items-center">{(Object.keys(COLOR_ESTADO) as EstadoColorKey[]).map((k) => <PuntoEstado key={k} status={k} />)}</div>;
}
