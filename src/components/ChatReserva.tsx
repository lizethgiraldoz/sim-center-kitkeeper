import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, CheckCheck, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmt, useSessionUser } from "@/lib/app-data";

/** Chat ligado a una sola reserva; solo se renderiza dentro del detalle de la solicitud. */
export function ChatReserva({ reservationId, teacherId }: { reservationId: string; teacherId: string }) {
  const { data: me } = useSessionUser();
  const [txt, setTxt] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ["chat", reservationId],
    queryFn: async () => (await supabase.from("reservation_messages").select("*").eq("reservation_id", reservationId).order("created_at")).data ?? [],
  });

  useEffect(() => {
    const ch = supabase.channel(`chat-${reservationId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservation_messages", filter: `reservation_id=eq.${reservationId}` }, () => q.refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
    if (q.data?.some((m) => m.sender_id !== me?.id && !m.read_at)) supabase.rpc("marcar_mensajes_leidos", { _rid: reservationId });
  }, [q.data, me?.id, reservationId]);

  const enviar = async () => {
    const m = txt.trim(); if (!m) return;
    setTxt("");
    await supabase.from("reservation_messages").insert({ reservation_id: reservationId, mensaje: m });
    q.refetch();
  };

  return (
    <div className="rounded-xl border bg-muted/30">
      <p className="px-3 py-2 border-b text-sm font-semibold">Conversación de esta solicitud</p>
      <div className="max-h-64 overflow-auto p-3 space-y-2">
        {q.data?.length === 0 && <p className="text-xs text-muted-foreground">Aún no hay mensajes. Escriba una observación para el {me?.id === teacherId ? "administrador" : "docente"}.</p>}
        {q.data?.map((m) => {
          const mio = m.sender_id === me?.id;
          const esDocente = m.sender_id === teacherId;
          return (
            <div key={m.id} className={`flex gap-2 ${mio ? "flex-row-reverse" : ""}`}>
              <span className={`h-7 w-7 shrink-0 rounded-full grid place-items-center text-[10px] font-bold ${esDocente ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}>{esDocente ? "DO" : "AD"}</span>
              <div className={`max-w-[75%] rounded-xl px-3 py-1.5 text-sm shadow-sm ${mio ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"}`}>
                <p className="whitespace-pre-wrap">{m.mensaje}</p>
                <p className="text-[10px] opacity-70 flex items-center gap-1 justify-end">{fmt(m.created_at)}{mio && (m.read_at ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="flex gap-2 p-2 border-t">
        <Input placeholder="Escribir mensaje…" value={txt} maxLength={2000} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} />
        <Button size="icon" onClick={enviar} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
