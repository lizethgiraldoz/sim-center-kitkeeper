import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import logo from "@/assets/logo-udea.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Laboratorio de Simulación UdeA · Reservas" },
      { name: "description", content: "Plataforma de reservas del Laboratorio de Simulación, Facultad de Medicina, Universidad de Antioquia." },
      { property: "og:title", content: "Laboratorio de Simulación UdeA · Reservas" },
      { property: "og:description", content: "Reservas de espacios, equipos, simuladores e insumos con bloqueo automático de cruces." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [msg, setMsg] = useState("");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: "/nueva-reserva" }); });
  }, [navigate]);
  const go = async (signup: boolean) => {
    setMsg("");
    const { data, error } = signup
      ? await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) return setMsg(error.message);
    if (signup) window.__lovableEvents?.track?.("project.teacher_signup", {});
    if (data.session) { qc.clear(); navigate({ to: "/nueva-reserva" }); }
    else if (signup) setMsg("Revisa tu correo para confirmar la cuenta.");
  };
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-muted p-4">
      <div className="text-center space-y-2">
        <img src={logo.url} alt="Universidad de Antioquia" className="h-20 w-auto mx-auto" />
        <h1 className="text-2xl text-primary">Laboratorio de Simulación</h1>
        <p className="text-sm italic text-muted-foreground">Facultad de Medicina · Reservas</p>
      </div>
      <Card className="w-full max-w-sm border-t-4 border-t-primary">
        <CardHeader><CardTitle>Ingresar</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Contraseña" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go(false)} />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => go(false)}>Iniciar sesión</Button>
            <Button variant="outline" onClick={() => go(true)}>Registrarse</Button>
          </div>
          {msg && <p className="text-sm text-destructive">{msg}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
