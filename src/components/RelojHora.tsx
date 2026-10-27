import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const HORAS = Array.from({ length: 12 }, (_, i) => i + 7); // 07..18 → se muestran 12 posiciones
const MINUTOS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const p2 = (n: number) => String(n).padStart(2, "0");

/** Selector de hora tipo reloj de pared. Rango operativo 07:00–19:00. */
export function RelojHora({ value, onChange, max = "19:00" }: { value: string; onChange: (v: string) => void; max?: string }) {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"h" | "m">("h");
  const [hh, mm] = value.split(":").map(Number);
  const items = modo === "h" ? [...HORAS.slice(0, 12)] : MINUTOS;
  const horasDial = modo === "h" ? [19, ...HORAS.slice(1)] : items; // 19 ocupa la posición superior (como las 12)
  const set = (v: number) => {
    if (modo === "h") { onChange(`${p2(v)}:${v === 19 ? "00" : p2(mm)}`); if (v !== 19) setModo("m"); else setOpen(false); }
    else { onChange(`${p2(hh)}:${p2(v)}`); setOpen(false); setModo("h"); }
  };
  const sel = modo === "h" ? hh : mm;
  const ang = ((modo === "h" ? (sel === 19 ? 0 : sel - 7) : sel / 5) * 30 - 90) * (Math.PI / 180);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); setModo("h"); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`w-full justify-start font-normal ${value > max ? "border-destructive text-destructive" : ""}`}>
          <Clock className="h-4 w-4" />{value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex justify-center gap-1 mb-2 text-2xl font-semibold">
          <button className={modo === "h" ? "text-primary" : "text-muted-foreground"} onClick={() => setModo("h")}>{p2(hh)}</button>:
          <button className={modo === "m" ? "text-primary" : "text-muted-foreground"} onClick={() => setModo("m")} disabled={hh === 19}>{p2(mm)}</button>
        </div>
        <div className="relative mx-auto h-52 w-52 rounded-full border-4 border-primary/30 bg-muted">
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
          <span className="absolute left-1/2 top-1/2 h-0.5 origin-left bg-primary" style={{ width: 74, transform: `rotate(${ang}rad)` }} />
          {horasDial.map((v, i) => {
            const a = (i * 30 - 90) * (Math.PI / 180);
            const activo = v === sel;
            return (
              <button key={v} type="button" onClick={() => set(v)}
                className={`absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full text-sm ${activo ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"}`}
                style={{ left: `${50 + 40 * Math.cos(a)}%`, top: `${50 + 40 * Math.sin(a)}%` }}>
                {modo === "h" ? v : p2(v)}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">{modo === "h" ? "Elija la hora (07–19)" : "Elija los minutos"}</p>
      </PopoverContent>
    </Popover>
  );
}
