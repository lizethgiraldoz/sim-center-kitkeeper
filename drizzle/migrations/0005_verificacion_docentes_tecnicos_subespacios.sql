ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS estado_cuenta text NOT NULL DEFAULT 'PENDIENTE';
UPDATE public.profiles SET estado_cuenta = 'VERIFICADA';

CREATE OR REPLACE FUNCTION public.proteger_estado_cuenta() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado_cuenta IS DISTINCT FROM OLD.estado_cuenta AND NOT public.has_role(auth.uid(), 'ADMINISTRADOR_REVISOR') THEN
    RAISE EXCEPTION 'Solo el administrador puede verificar cuentas';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_proteger_estado_cuenta BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.proteger_estado_cuenta();

-- Admins created on signup are verified automatically
CREATE OR REPLACE FUNCTION public.verificar_admin_nuevo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'ADMINISTRADOR_REVISOR' THEN UPDATE public.profiles SET estado_cuenta = 'VERIFICADA' WHERE id = NEW.user_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_verificar_admin_nuevo AFTER INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.verificar_admin_nuevo();

CREATE OR REPLACE FUNCTION public.exigir_docente_verificado() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(NEW.teacher_id, 'ADMINISTRADOR_REVISOR')
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.teacher_id AND estado_cuenta = 'VERIFICADA') THEN
    RAISE EXCEPTION 'Tu cuenta aún no ha sido verificada por el administrador';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_exigir_docente_verificado BEFORE INSERT ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.exigir_docente_verificado();

CREATE OR REPLACE FUNCTION public.verificar_docente(_id uuid, _estado text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _estado NOT IN ('VERIFICADA','RECHAZADA','PENDIENTE') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
  UPDATE public.profiles SET estado_cuenta = _estado WHERE id = _id;
END $$;

-- Technician tracking
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS estado_montaje text NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS falta_equipo text,
  ADD COLUMN IF NOT EXISTS salida_estado text,
  ADD COLUMN IF NOT EXISTS asistencia text;

CREATE OR REPLACE FUNCTION public.actualizar_seguimiento(_id uuid, _campo text, _valor text, _detalle text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF _campo = 'montaje' THEN
    IF _valor NOT IN ('PENDIENTE','EN_MONTAJE','LISTO','FALTA_EQUIPO') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
    UPDATE public.reservations SET estado_montaje = _valor, falta_equipo = CASE WHEN _valor='FALTA_EQUIPO' THEN _detalle END WHERE id = _id;
  ELSIF _campo = 'salida' THEN
    IF _valor NOT IN ('AUTORIZADA','ENTREGADO','RETORNADO') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
    UPDATE public.reservations SET salida_estado = _valor WHERE id = _id;
  ELSIF _campo = 'asistencia' THEN
    IF _valor NOT IN ('ASISTIO','NO_ASISTIO') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
    IF _valor = 'NO_ASISTIO' THEN
      UPDATE public.reservations SET asistencia = _valor, status = 'CANCELADA', cancelled_by = auth.uid(), cancelled_at = now(),
        justificacion_cancelacion = 'Docente no asistió (espacio liberado)' WHERE id = _id;
    ELSE
      UPDATE public.reservations SET asistencia = _valor WHERE id = _id;
    END IF;
  ELSE RAISE EXCEPTION 'Campo inválido'; END IF;
END $$;

-- Subspaces
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS parent_space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE;

-- Semester practice rules (for later Excel import)
CREATE TABLE public.semester_practice_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa text NOT NULL,
  semestre integer NOT NULL,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  UNIQUE (programa, semestre, activity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.semester_practice_rules TO authenticated;
GRANT ALL ON public.semester_practice_rules TO service_role;
ALTER TABLE public.semester_practice_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lectura autenticados" ON public.semester_practice_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin gestiona" ON public.semester_practice_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR_REVISOR')) WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR_REVISOR'));