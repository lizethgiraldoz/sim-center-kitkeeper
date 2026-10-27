import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/app-data";

/** Mensajes no leídos (enviados por otra persona) agrupados por reserva. */
export function useNoLeidos() {
  const { data: me } = useSessionUser();
  const q = useQuery({
    queryKey: ["no-leidos", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("reservation_messages").select("reservation_id").is("read_at", null).neq("sender_id", me!.id);
      const m: Record<string, number> = {};
      (data ?? []).forEach((x) => { m[x.reservation_id] = (m[x.reservation_id] ?? 0) + 1; });
      return m;
    },
  });
  useEffect(() => {
    const ch = supabase.channel(`noleidos-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservation_messages" }, () => q.refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return q.data ?? {};
}
