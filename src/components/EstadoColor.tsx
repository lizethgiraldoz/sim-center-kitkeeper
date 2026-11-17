import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
/** Convención de colores: verde libre/disponible, rojo reservado/ocupado. */
export const COLOR_ESTADO = {
  DISPONIBLE: { cls: "bg-emerald-500", label: "Libre / Disponible" },
  RESERVADO: { cls: "bg-rose-600", label: "Reservado / Ocupado" },
} as const;
export type EstadoColorKey = keyof typeof COLOR_ESTADO;
export function PuntoEstado({ status, extra }: { status: EstadoColorKey; extra?: string }) {
  const c = COLOR_ESTADO[status] ?? COLOR_ESTADO.DISPONIBLE;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={c.label}
            className={`inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-background ${c.cls}`}
          />
        </TooltipTrigger>
        <TooltipContent>
          {c.label}
          {extra ? ` · ${extra}` : ""}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
export function LeyendaColores() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {(Object.keys(COLOR_ESTADO) as EstadoColorKey[]).map((k) => {
        const item = COLOR_ESTADO[k];
        return (
          <span key={k} className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span className={`inline-block h-3 w-3 rounded-full ${item.cls}`} />
            {item.label}
          </span>
        );
      })}
    </div>
  );
}