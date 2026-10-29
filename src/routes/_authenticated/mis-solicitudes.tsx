import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EstadoBadge } from "@/components/EstadoBadge";
import { useNoLeidos } from "@/lib/unread";
import { DetalleReserva } from "@/components/DetalleReserva";
import { Titulo } from "@/components/SoloAdmin";
import { RESERVA_SELECT, fmt, hora, useSessionUser, type Row } from "@/lib/app-data";

export const Route = createFileRoute("/_authenticated/mis-solicitudes")({
  head: () => ({ meta: [{ title: "Mis solicitudes · Centro de Simulación UdeA" }] }),
  component: Page,
});

function Page() {
  const { data: me } = useSessionUser();
  const q = useQuery({
    queryKey: ["reservas", "mias", me?.id],
    enabled: !!me,
    queryFn: async () => (await supabase.from("reservations").select(RESERVA_SELECT).eq("teacher_id", me!.id).order("starts_at", { ascending: false })).data ?? [],
  });
  const noLeidos = useNoLeidos();
  const [sel, setSel] = useState<Row | null>(null);
  const [canc, setCanc] = useState<Row | null>(null);
  const [just, setJust] = useState("");
  const cancelar = async () => {
    const { error } = await supabase.rpc("cancelar_reserva_justificada", { _id: canc.id, _justificacion: just.trim() });
    if (error) toast.error(error.message); else { toast.success("Reserva cancelada"); setCanc(null); q.refetch(); }
  };
  const rows = q.data ?? [];
  return (
    <div>
      <Titulo t="Mis solicitudes" d="Historial y estado de tus reservas" />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Actividad</TableHead><TableHead>Espacio</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Aún no tienes solicitudes.</TableCell></TableRow>}
            {rows.map((r: Row) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.activities?.name}</TableCell>
                <TableCell>{r.spaces?.name}</TableCell>
                <TableCell className="whitespace-nowrap">{fmt(r.starts_at)} – {hora(r.ends_at)}</TableCell>
                <TableCell><EstadoBadge status={r.status} /></TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => setSel(r)}>Ver detalle{(noLeidos[r.id] ?? 0) > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground" aria-label="Mensajes sin leer">{noLeidos[r.id]}</span>}</Button>
                  {["SOLICITADA", "APROBADA"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => { setJust(""); setCanc(r); }}>Cancelar solicitud</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Dialog open={!!canc} onOpenChange={(o) => !o && setCanc(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>¿Deseas cancelar esta reserva?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{canc?.activities?.name} · {canc && fmt(canc.starts_at)}</p>
          <Textarea className="text-gray-900" placeholder="Justificación de la cancelación (obligatoria)" value={just} maxLength={1000} onChange={(e) => setJust(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCanc(null)}>Volver</Button>
            <Button variant="destructive" disabled={just.trim().length < 3} onClick={cancelar}>Confirmar cancelación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {sel && <DetalleReserva r={rows.find((x: Row) => x.id === sel.id) ?? sel} open onOpenChange={(o) => !o && setSel(null)} onChanged={() => q.refetch()} />}
    </div>
  );
}
