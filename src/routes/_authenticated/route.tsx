import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FilePlus, ListChecks, CalendarRange, ClipboardCheck, Boxes, BarChart3, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSessionUser } from "@/lib/app-data";
import logo from "@/assets/logo-udea.png.asset.json";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/" });
  },
  component: Shell,
});

const DOCENTE = [
  { title: "Nueva reserva", url: "/nueva-reserva", icon: FilePlus },
  { title: "Mis solicitudes", url: "/mis-solicitudes", icon: ListChecks },
] as const;
const ADMIN = [
  { title: "Disponibilidad y bloqueos", url: "/disponibilidad", icon: CalendarRange },
  { title: "Gestión de solicitudes", url: "/solicitudes", icon: ClipboardCheck },
  { title: "Inventario y quirófano", url: "/inventario", icon: Boxes },
  { title: "Estadísticas", url: "/reportes", icon: BarChart3 },
] as const;

function Shell() {
  const { data: me } = useSessionUser();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const salir = async () => {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };
  const groups = [{ label: "Docente", items: DOCENTE }, ...(me?.isAdmin ? [{ label: "Administración", items: ADMIN }] : [])];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b">
            <img src={logo.url} alt="Universidad de Antioquia" className="h-10 w-auto object-contain object-left group-data-[collapsible=icon]:hidden" />
          </SidebarHeader>
          <SidebarContent>
            {groups.map((g) => (
              <SidebarGroup key={g.label}>
                <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.items.map((it) => (
                      <SidebarMenuItem key={it.url}>
                        <SidebarMenuButton asChild isActive={path === it.url} tooltip={it.title}>
                          <Link to={it.url}><it.icon className="h-4 w-4" /><span>{it.title}</span></Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>
        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b-4 border-primary bg-background px-3">
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-primary" style={{ fontFamily: "Roboto Slab, serif" }}>Laboratorio de Simulación</p>
              <p className="truncate text-xs italic text-muted-foreground">Facultad de Medicina · UdeA</p>
            </div>
            <div className="hidden sm:flex flex-col items-end text-xs">
              <span className="truncate max-w-48">{me?.email}</span>
              <Badge variant="secondary" className="text-[10px]">{me?.isAdmin ? "Administrador revisor" : "Docente"}</Badge>
            </div>
            <Button size="sm" variant="outline" onClick={salir}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Salir</span></Button>
          </header>
          <main className="flex-1 p-4 md:p-6"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
