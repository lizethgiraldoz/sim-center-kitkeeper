import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSessionUser } from "@/lib/app-data";

export function SoloAdmin({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useSessionUser();
  if (isLoading) return null;
  if (!me?.isAdmin)
    return (
      <Alert><AlertTitle>Acceso restringido</AlertTitle>
        <AlertDescription>Esta sección es solo para el Administrador revisor.</AlertDescription></Alert>
    );
  return <>{children}</>;
}

export function Titulo({ t, d }: { t: string; d?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl text-primary">{t}</h1>
      {d && <p className="text-sm italic text-muted-foreground">{d}</p>}
    </div>
  );
}
