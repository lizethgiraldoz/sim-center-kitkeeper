import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  SOLICITADA: "bg-warning text-warning-foreground",
  APROBADA: "bg-success text-success-foreground",
  EN_CURSO: "bg-primary text-primary-foreground",
  RECHAZADA: "bg-destructive text-destructive-foreground",
  CANCELADA: "bg-muted text-muted-foreground",
  DISPONIBLE: "bg-success text-success-foreground",
  RESERVADO: "bg-info text-info-foreground",
  EN_MANTENIMIENTO: "bg-orange text-orange-foreground",
  FUERA_DE_SERVICIO: "bg-destructive text-destructive-foreground",
  COMPLETO: "bg-success text-success-foreground",
  SEPARADO: "bg-warning text-warning-foreground",
  INCOMPLETO: "bg-destructive text-destructive-foreground",
  EN_ESTERILIZACION: "bg-secondary text-secondary-foreground border",
};

export function EstadoBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", STYLES[status] ?? "bg-muted", className)}>
      {status?.replaceAll("_", " ")}
    </span>
  );
}
