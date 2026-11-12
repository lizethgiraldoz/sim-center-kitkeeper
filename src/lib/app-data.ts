import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = any;
export const fmt = (d: string) => new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });
export const hora = (d: string) => new Date(d).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });
export const RESERVA_SELECT =
  "*, spaces(name, type), activities(name), reservation_resources(resource_id, quantity, cantidad_aprobada, resources(id, name, numero_inventario, allows_external_exit)), external_borrow_forms(*)";
export function useSessionUser() {
  return useQuery({
    queryKey: ["session-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      return { id: user.id, email: user.email ?? "", isAdmin: !!roles?.some((r) => r.role === "ADMINISTRADOR_REVISOR") };
    },
  });
}
export function useCatalogos() {
  return useQuery({
    queryKey: ["catalogos"],
    queryFn: async () => {
      const [s, a] = await Promise.all([
        supabase.from("spaces").select("*").order("name"),
        supabase.from("activities").select("*").order("name"),
      ]);
      return { spaces: s.data ?? [], activities: a.data ?? [] };
    },
  });
}