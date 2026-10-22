import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormularioReserva, ListaChequeo, FormatoImprimible } from "@/components/FormularioReserva";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Centro de Simulación UdeA · Consola de reservas" },
      { name: "description", content: "Consola de prueba del backend de reservas del Centro de Simulación, Facultad de Medicina UdeA." },
      { property: "og:title", content: "Centro de Simulación UdeA · Consola de reservas" },
      { property: "og:description", content: "Reservas de espacios, equipos, simuladores e insumos con bloqueo automático de cruces." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const fmt = (d: string) => new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota" });

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return null;
  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Centro de Simulación · Medicina UdeA</h1>
          <p className="text-sm text-muted-foreground">Solicitud de reserva · Formato F-CS-01</p>
        </div>
        {session && <Button variant="outline" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>}
      </header>
      {session ? <Console userId={session.user.id} /> : <Auth />}
    </main>
  );
}

function Auth() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [msg, setMsg] = useState("");
  const go = async (signup: boolean) => {
    setMsg("");
    const { data, error } = signup
      ? await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setMsg(error.message);
    else if (signup && !data.session) setMsg("Revisa tu correo para confirmar la cuenta.");
  };
  return (
    <Card className="max-w-sm mx-auto">
      <CardHeader><CardTitle>Ingresar</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input placeholder="Contraseña" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={() => go(false)}>Iniciar sesión</Button>
          <Button variant="outline" onClick={() => go(true)}>Registrarse</Button>
        </div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        <p className="text-xs text-muted-foreground">El primer usuario registrado queda como Administrador revisor.</p>
      </CardContent>
    </Card>
  );
}

function Console({ userId }: { userId: string }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [spaces, setSpaces] = useState<Row[]>([]);
  const [activities, setActivities] = useState<Row[]>([]);
  const [reservations, setReservations] = useState<Row[]>([]);
  const [blocks, setBlocks] = useState<Row[]>([]);
  const [kits, setKits] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [r, s, a, rs, b, k] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("spaces").select("*").order("name"),
      supabase.from("activities").select("*").order("name"),
      supabase.from("reservations").select("*, spaces(name), activities(name), reservation_resources(quantity, resources(name)), external_borrow_forms(*)").order("starts_at"),
      supabase.rpc("dashboard_bloqueos"),
      supabase.from("quirofano_instrumental").select("*"),
    ]);
    setIsAdmin(!!r.data?.some((x) => x.role === "ADMINISTRADOR_REVISOR"));
    setSpaces(s.data ?? []); setActivities(a.data ?? []); setReservations(rs.data ?? []);
    setBlocks(b.data ?? []); setKits(k.data ?? []);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const run = async (p: PromiseLike<{ error: any }>, ok: string) => {
    const { error } = await p; setMsg(error ? `Error: ${error.message}` : ok); await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        Rol: <Badge>{isAdmin ? "ADMINISTRADOR_REVISOR" : "DOCENTE"}</Badge>
        {msg && <span className={msg.startsWith("Error") ? "text-destructive" : "text-primary"}>{msg}</span>}
      </div>

      <FormularioReserva spaces={spaces} activities={activities} onDone={async (m) => { setMsg(m); await load(); }} />

      <Card>
        <CardHeader><CardTitle>Reservas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {reservations.length === 0 && <p className="text-sm text-muted-foreground">Sin reservas aún.</p>}
          {reservations.map((r) => <ReservationRow key={r.id} r={r} isAdmin={isAdmin} spaces={spaces} run={run} />)}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tablero de bloqueos</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {blocks.length === 0 && <p className="text-muted-foreground">Nada bloqueado.</p>}
            {blocks.map((b, i) => <div key={i} className="flex justify-between border-b py-1"><span>{b.name}</span><span className="text-muted-foreground">{b.status}{b.starts_at ? ` · ${fmt(b.starts_at)}` : ""}</span></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quirófano · instrumental</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {kits.map((k) => <div key={k.kit_id} className="flex justify-between border-b py-1"><span>{k.kit_name}</span><span className="text-muted-foreground">{k.kit_status} · {k.piezas_disponibles}/{k.total_piezas} pinzas</span></div>)}
          </CardContent>
        </Card>
      </div>
      <ListaChequeo />
    </div>
  );
}

function ReservationRow({ r, isAdmin, spaces, run }: { r: Row; isAdmin: boolean; spaces: Row[]; run: (p: PromiseLike<{ error: any }>, ok: string) => Promise<void> }) {
  const form = r.external_borrow_forms?.[0] ?? r.external_borrow_forms;
  const [ext, setExt] = useState({ responsible_name: "", responsible_document: "", responsible_phone: "", destination: "", purpose: "" });
  const [newSpace, setNewSpace] = useState("");
  const [print, setPrint] = useState(false);
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={r.status === "APROBADA" ? "default" : "secondary"}>{r.status}</Badge>
        <strong>{r.activities?.name}</strong> · {r.spaces?.name} · {fmt(r.starts_at)} → {new Date(r.ends_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })}
        {r.leaves_faculty && <Badge variant="outline">Salida externa</Badge>}
        {r.requiere_ingreso_30min_antes && <Badge variant="outline">Llegar 30 min antes</Badge>}
        <Button size="sm" variant="link" onClick={() => setPrint(true)}>Ver formato F-CS-01</Button>
        {print && <FormatoImprimible r={r} onClose={() => setPrint(false)} />}
      </div>
      <p className="text-xs text-muted-foreground">{r.reservation_resources?.map((x: Row) => `${x.resources?.name} x${x.quantity}`).join(" · ")}</p>
      {r.rejection_reason && <p className="text-xs text-destructive">Motivo: {r.rejection_reason}</p>}
      {r.leaves_faculty && form && r.status === "SOLICITADA" && !form.accepts_responsibility && (
        <div className="grid gap-2 md:grid-cols-6">
          {(Object.keys(ext) as (keyof typeof ext)[]).map((k) => <Input key={k} placeholder={k.replace("responsible_", "").replace("_", " ")} value={ext[k]} onChange={(e) => setExt({ ...ext, [k]: e.target.value })} />)}
          <Button size="sm" variant="outline" onClick={() => run(supabase.from("external_borrow_forms").update({ ...ext, departure_at: r.starts_at, return_at: r.ends_at, accepts_responsibility: true }).eq("id", form.id), "Formulario de salida guardado")}>Guardar formulario</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {isAdmin && r.status === "SOLICITADA" && <>
          <Button size="sm" onClick={() => run(supabase.rpc("aprobar_reserva", { _id: r.id }), "Reserva aprobada y recursos bloqueados")}>Aprobar</Button>
          <Button size="sm" variant="outline" onClick={() => run(supabase.rpc("rechazar_reserva", { _id: r.id, _reason: "Rechazada por revisor" }), "Reserva rechazada")}>Rechazar</Button>
        </>}
        {isAdmin && ["SOLICITADA", "APROBADA"].includes(r.status) && <>
          <select className="border rounded-md px-2 h-8 text-sm bg-background" value={newSpace} onChange={(e) => setNewSpace(e.target.value)}>
            <option value="">Reasignar espacio…</option>
            {spaces.filter((s) => s.id !== r.space_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {newSpace && <Button size="sm" variant="outline" onClick={() => run(supabase.rpc("reasignar_espacio", { _id: r.id, _new_space_id: newSpace }), "Espacio reasignado")}>Aplicar</Button>}
        </>}
        {["SOLICITADA", "APROBADA"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => run(supabase.rpc("cancelar_reserva", { _id: r.id }), "Reserva cancelada")}>Cancelar</Button>}
      </div>
    </div>
  );
}
