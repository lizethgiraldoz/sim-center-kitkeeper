
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ===== Enums =====
CREATE TYPE public.app_role AS ENUM ('DOCENTE','ADMINISTRADOR_REVISOR');
CREATE TYPE public.space_type AS ENUM ('FIJO','MOVIL');
CREATE TYPE public.asset_status AS ENUM ('DISPONIBLE','RESERVADO','EN_MANTENIMIENTO','FUERA_DE_SERVICIO');
CREATE TYPE public.resource_kind AS ENUM ('EQUIPO','SIMULADOR','INSUMO','PAQUETE_QUIRURGICO');
CREATE TYPE public.reservation_status AS ENUM ('SOLICITADA','APROBADA','RECHAZADA','EN_CURSO','CANCELADA');
CREATE TYPE public.kit_status AS ENUM ('COMPLETO','SEPARADO','INCOMPLETO','EN_ESTERILIZACION');

-- ===== Usuarios y roles =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "perfil propio o admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'));
CREATE POLICY "editar perfil propio" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "ver roles propios o admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'));

-- Alta automática: todos DOCENTE; el primer usuario registrado también ADMINISTRADOR_REVISOR
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'DOCENTE');
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'ADMINISTRADOR_REVISOR') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'ADMINISTRADOR_REVISOR');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== Espacios =====
CREATE TABLE public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  type public.space_type NOT NULL DEFAULT 'FIJO',
  capacity int NOT NULL CHECK (capacity > 0),
  open_time time NOT NULL DEFAULT '07:00',
  close_time time NOT NULL DEFAULT '19:00' CHECK (close_time <= '19:00'),
  status public.asset_status NOT NULL DEFAULT 'DISPONIBLE',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (open_time < close_time)
);

-- ===== Recursos =====
CREATE TABLE public.resource_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind public.resource_kind NOT NULL
);
CREATE TABLE public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.resource_categories(id),
  name text NOT NULL,
  code text UNIQUE,
  quantity_total int NOT NULL DEFAULT 1 CHECK (quantity_total >= 0),
  status public.asset_status NOT NULL DEFAULT 'DISPONIBLE',
  allows_external_exit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.resources(category_id);

-- ===== Actividades y plantillas =====
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  default_duration_minutes int NOT NULL DEFAULT 120
);
CREATE TABLE public.activity_resource_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resources(id),
  quantity int NOT NULL CHECK (quantity > 0),
  UNIQUE (activity_id, resource_id)
);

-- ===== Quirófano =====
CREATE TABLE public.surgical_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid UNIQUE REFERENCES public.resources(id) ON DELETE SET NULL,
  name text NOT NULL,
  status public.kit_status NOT NULL DEFAULT 'COMPLETO',
  last_regrouped_at timestamptz,
  notes text
);
CREATE TABLE public.surgical_instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid REFERENCES public.surgical_kits(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text UNIQUE,
  status public.asset_status NOT NULL DEFAULT 'DISPONIBLE',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.surgical_instruments(kit_id);

-- ===== Reservas =====
CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  reviewer_id uuid,
  space_id uuid NOT NULL REFERENCES public.spaces(id),
  activity_id uuid REFERENCES public.activities(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  participants int NOT NULL DEFAULT 1 CHECK (participants > 0),
  status public.reservation_status NOT NULL DEFAULT 'SOLICITADA',
  leaves_faculty boolean NOT NULL DEFAULT false,
  notes text,
  rejection_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid,
  cancelled_at timestamptz,
  CHECK (ends_at > starts_at),
  -- Impide cruces de espacio entre reservas bloqueantes
  CONSTRAINT no_cruce_espacio EXCLUDE USING gist (
    space_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('APROBADA','EN_CURSO'))
);
CREATE INDEX ON public.reservations(teacher_id);
CREATE INDEX ON public.reservations(status);
CREATE INDEX ON public.reservations USING gist (tstzrange(starts_at, ends_at, '[)'));

CREATE TABLE public.reservation_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resources(id),
  quantity int NOT NULL CHECK (quantity > 0),
  UNIQUE (reservation_id, resource_id)
);
CREATE INDEX ON public.reservation_resources(resource_id);

CREATE TABLE public.external_borrow_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE CASCADE,
  responsible_name text,
  responsible_document text,
  responsible_phone text,
  destination text,
  purpose text,
  departure_at timestamptz,
  return_at timestamptz,
  accepts_responsibility boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reservation_audit (
  id bigserial PRIMARY KEY,
  reservation_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  old_status public.reservation_status,
  new_status public.reservation_status,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Grants + RLS =====
GRANT SELECT ON public.spaces, public.resource_categories, public.resources, public.activities,
  public.activity_resource_templates, public.surgical_kits, public.surgical_instruments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.spaces, public.resource_categories, public.resources, public.activities,
  public.activity_resource_templates, public.surgical_kits, public.surgical_instruments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_resources, public.external_borrow_forms TO authenticated;
GRANT SELECT ON public.reservation_audit TO authenticated;
GRANT SELECT, UPDATE ON public.alerts TO authenticated;
GRANT ALL ON public.spaces, public.resource_categories, public.resources, public.activities,
  public.activity_resource_templates, public.surgical_kits, public.surgical_instruments,
  public.reservations, public.reservation_resources, public.external_borrow_forms,
  public.reservation_audit, public.alerts TO service_role;
GRANT USAGE ON SEQUENCE public.reservation_audit_id_seq TO service_role;

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_resource_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgical_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgical_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_borrow_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['spaces','resource_categories','resources','activities',
    'activity_resource_templates','surgical_kits','surgical_instruments'] LOOP
    EXECUTE format('CREATE POLICY "lectura autenticados" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "admin gestiona" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(),''ADMINISTRADOR_REVISOR'')) WITH CHECK (public.has_role(auth.uid(),''ADMINISTRADOR_REVISOR''))', t);
  END LOOP;
END $$;

CREATE POLICY "ver reservas propias o admin" ON public.reservations FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'));
CREATE POLICY "docente crea su reserva" ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND status = 'SOLICITADA');
CREATE POLICY "docente edita su solicitud o admin" ON public.reservations FOR UPDATE TO authenticated
  USING ((teacher_id = auth.uid() AND status = 'SOLICITADA') OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'));

CREATE POLICY "detalle segun reserva" ON public.reservation_resources FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id
     AND ((r.teacher_id = auth.uid() AND r.status = 'SOLICITADA') OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id
     AND ((r.teacher_id = auth.uid() AND r.status = 'SOLICITADA') OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'))));
CREATE POLICY "ver detalle propio" ON public.reservation_resources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.teacher_id = auth.uid()));

CREATE POLICY "formulario segun reserva" ON public.external_borrow_forms FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id
     AND (r.teacher_id = auth.uid() OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id
     AND (r.teacher_id = auth.uid() OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'))));

CREATE POLICY "ver auditoria" ON public.reservation_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') OR EXISTS
    (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.teacher_id = auth.uid()));

CREATE POLICY "alertas propias" ON public.alerts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "marcar leidas" ON public.alerts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ===== Reglas: horario y validación =====
CREATE OR REPLACE FUNCTION public.validate_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.spaces; ls timestamp; le timestamp;
BEGIN
  SELECT * INTO s FROM public.spaces WHERE id = NEW.space_id;
  ls := NEW.starts_at AT TIME ZONE 'America/Bogota';
  le := NEW.ends_at AT TIME ZONE 'America/Bogota';
  IF NEW.status IN ('SOLICITADA','APROBADA') THEN
    IF ls::date <> le::date THEN
      RAISE EXCEPTION 'La reserva debe iniciar y terminar el mismo día';
    END IF;
    IF ls::time < s.open_time OR le::time > s.close_time OR le::time > '19:00'::time THEN
      RAISE EXCEPTION 'Horario fuera del rango permitido del espacio % (% - %, límite 19:00)', s.name, s.open_time, s.close_time;
    END IF;
    IF NEW.participants > s.capacity THEN
      RAISE EXCEPTION 'El espacio % tiene capacidad para % personas', s.name, s.capacity;
    END IF;
    IF s.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO') THEN
      RAISE EXCEPTION 'El espacio % no está disponible (%)', s.name, s.status;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
    IF NEW.status = 'CANCELADA' AND OLD.status <> 'CANCELADA' THEN
      NEW.cancelled_by := auth.uid(); NEW.cancelled_at := now();
    END IF;
    -- Solo el revisor puede cambiar a estados distintos de CANCELADA
    IF NEW.status <> OLD.status AND NEW.status <> 'CANCELADA'
       AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN
      RAISE EXCEPTION 'Solo un administrador revisor puede cambiar el estado a %', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_reservation BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.validate_reservation();

-- Verifica solapamiento de recursos (cantidad disponible en el rango)
CREATE OR REPLACE FUNCTION public.check_resource_conflicts(_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reservations; rec record;
BEGIN
  SELECT * INTO r FROM public.reservations WHERE id = _reservation_id;
  FOR rec IN
    SELECT rr.resource_id, rr.quantity, res.name, res.quantity_total, res.status,
      COALESCE((SELECT SUM(o.quantity) FROM public.reservation_resources o
        JOIN public.reservations x ON x.id = o.reservation_id
        WHERE o.resource_id = rr.resource_id AND x.id <> r.id
          AND x.status IN ('APROBADA','EN_CURSO')
          AND tstzrange(x.starts_at, x.ends_at,'[)') && tstzrange(r.starts_at, r.ends_at,'[)')),0) AS used
    FROM public.reservation_resources rr JOIN public.resources res ON res.id = rr.resource_id
    WHERE rr.reservation_id = r.id
  LOOP
    IF rec.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO') THEN
      RAISE EXCEPTION 'El recurso % no está disponible (%)', rec.name, rec.status;
    END IF;
    IF rec.used + rec.quantity > rec.quantity_total THEN
      RAISE EXCEPTION 'Cruce de recurso %: solicitado %, disponible % en ese horario',
        rec.name, rec.quantity, rec.quantity_total - rec.used;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.trg_reservation_blocking_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('APROBADA','EN_CURSO') THEN
    PERFORM public.check_resource_conflicts(NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_reservation_blocking AFTER INSERT OR UPDATE ON public.reservations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_reservation_blocking_check();

CREATE OR REPLACE FUNCTION public.trg_rr_blocking_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reservations WHERE id = NEW.reservation_id AND status IN ('APROBADA','EN_CURSO')) THEN
    PERFORM public.check_resource_conflicts(NEW.reservation_id);
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_rr_blocking AFTER INSERT OR UPDATE ON public.reservation_resources
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_rr_blocking_check();

-- Auditoría
CREATE OR REPLACE FUNCTION public.audit_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.reservation_audit(reservation_id, action, actor_id, new_status)
    VALUES (NEW.id, 'CREADA', auth.uid(), NEW.status);
  ELSE
    INSERT INTO public.reservation_audit(reservation_id, action, actor_id, old_status, new_status, details)
    VALUES (NEW.id, CASE WHEN NEW.status = 'CANCELADA' AND OLD.status <> 'CANCELADA' THEN 'CANCELADA'
                         WHEN NEW.status <> OLD.status THEN 'CAMBIO_ESTADO' ELSE 'MODIFICADA' END,
      auth.uid(), OLD.status, NEW.status,
      jsonb_build_object('space_from', OLD.space_id, 'space_to', NEW.space_id,
        'starts_at', NEW.starts_at, 'ends_at', NEW.ends_at));
    IF NEW.status <> OLD.status THEN
      INSERT INTO public.alerts(user_id, reservation_id, kind, message)
      VALUES (NEW.teacher_id, NEW.id, 'ESTADO', 'Tu reserva cambió a ' || NEW.status);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_reservation AFTER INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.audit_reservation();

-- ===== API (funciones RPC) =====
-- POST /api/reservas
CREATE OR REPLACE FUNCTION public.crear_reserva(
  _space_id uuid, _activity_id uuid, _starts_at timestamptz, _ends_at timestamptz,
  _participants int DEFAULT 1, _leaves_faculty boolean DEFAULT false, _notes text DEFAULT NULL,
  _group_multiplier int DEFAULT 1)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesión'; END IF;
  INSERT INTO public.reservations(teacher_id, space_id, activity_id, starts_at, ends_at, participants, leaves_faculty, notes)
  VALUES (auth.uid(), _space_id, _activity_id, _starts_at, _ends_at, _participants, _leaves_faculty, _notes)
  RETURNING id INTO new_id;
  INSERT INTO public.reservation_resources(reservation_id, resource_id, quantity)
  SELECT new_id, t.resource_id, t.quantity * GREATEST(_group_multiplier,1)
  FROM public.activity_resource_templates t WHERE t.activity_id = _activity_id;
  IF _leaves_faculty THEN
    INSERT INTO public.external_borrow_forms(reservation_id) VALUES (new_id);
  END IF;
  RETURN new_id;
END $$;

-- Formulario de salida externa completo
CREATE OR REPLACE FUNCTION public.external_form_complete(_reservation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.external_borrow_forms f WHERE f.reservation_id = _reservation_id
    AND coalesce(trim(f.responsible_name),'') <> '' AND coalesce(trim(f.responsible_document),'') <> ''
    AND coalesce(trim(f.responsible_phone),'') <> '' AND coalesce(trim(f.destination),'') <> ''
    AND coalesce(trim(f.purpose),'') <> '' AND f.departure_at IS NOT NULL AND f.return_at IS NOT NULL
    AND f.return_at > f.departure_at AND f.accepts_responsibility)
$$;

-- PUT /api/reservas/{id}/aprobar
CREATE OR REPLACE FUNCTION public.aprobar_reserva(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reservations;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF r.status <> 'SOLICITADA' THEN RAISE EXCEPTION 'Solo se aprueban reservas SOLICITADAS (actual: %)', r.status; END IF;
  IF r.leaves_faculty AND NOT public.external_form_complete(_id) THEN
    RAISE EXCEPTION 'El formulario de salida externa está incompleto';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservations x WHERE x.space_id = r.space_id AND x.id <> r.id
     AND x.status IN ('APROBADA','EN_CURSO')
     AND tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(r.starts_at,r.ends_at,'[)')) THEN
    RAISE EXCEPTION 'Cruce de horario: el espacio ya está reservado en ese rango';
  END IF;
  UPDATE public.reservations SET status = 'APROBADA', reviewer_id = auth.uid() WHERE id = _id;
  PERFORM public.check_resource_conflicts(_id);
END $$;

CREATE OR REPLACE FUNCTION public.rechazar_reserva(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE public.reservations SET status = 'RECHAZADA', reviewer_id = auth.uid(), rejection_reason = _reason
  WHERE id = _id AND status = 'SOLICITADA';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo se rechazan reservas SOLICITADAS'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cancelar_reserva(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.reservations SET status = 'CANCELADA'
  WHERE id = _id AND status IN ('SOLICITADA','APROBADA')
    AND (teacher_id = auth.uid() OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'));
  IF NOT FOUND THEN RAISE EXCEPTION 'No se puede cancelar esta reserva'; END IF;
END $$;

-- PUT /api/reservas/{id}/reasignar-espacio
CREATE OR REPLACE FUNCTION public.reasignar_espacio(_id uuid, _new_space_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reservations;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = _id FOR UPDATE;
  IF r.status NOT IN ('SOLICITADA','APROBADA') THEN RAISE EXCEPTION 'No se puede reasignar en estado %', r.status; END IF;
  IF EXISTS (SELECT 1 FROM public.reservations x WHERE x.space_id = _new_space_id AND x.id <> r.id
     AND x.status IN ('APROBADA','EN_CURSO')
     AND tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(r.starts_at,r.ends_at,'[)')) THEN
    RAISE EXCEPTION 'El nuevo espacio no está libre en ese horario';
  END IF;
  UPDATE public.reservations SET space_id = _new_space_id WHERE id = _id; -- conserva recursos
END $$;

-- GET /api/disponibilidad/espacios-equipos
CREATE OR REPLACE FUNCTION public.disponibilidad(_starts_at timestamptz, _ends_at timestamptz)
RETURNS TABLE(kind text, id uuid, name text, status text, total int, reserved int, available int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'ESPACIO', s.id, s.name, s.status::text, 1,
    (EXISTS (SELECT 1 FROM public.reservations x WHERE x.space_id = s.id AND x.status IN ('APROBADA','EN_CURSO')
      AND tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(_starts_at,_ends_at,'[)')))::int,
    CASE WHEN s.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO') OR EXISTS (SELECT 1 FROM public.reservations x
      WHERE x.space_id = s.id AND x.status IN ('APROBADA','EN_CURSO')
      AND tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(_starts_at,_ends_at,'[)')) THEN 0 ELSE 1 END
  FROM public.spaces s WHERE auth.uid() IS NOT NULL
  UNION ALL
  SELECT 'RECURSO', res.id, res.name, res.status::text, res.quantity_total, u.used,
    CASE WHEN res.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO') THEN 0 ELSE GREATEST(res.quantity_total - u.used,0) END
  FROM public.resources res
  CROSS JOIN LATERAL (SELECT COALESCE(SUM(rr.quantity),0)::int AS used FROM public.reservation_resources rr
    JOIN public.reservations x ON x.id = rr.reservation_id
    WHERE rr.resource_id = res.id AND x.status IN ('APROBADA','EN_CURSO')
      AND tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(_starts_at,_ends_at,'[)')) u
  WHERE auth.uid() IS NOT NULL
$$;

-- GET /api/dashboard/bloqueos
CREATE OR REPLACE FUNCTION public.dashboard_bloqueos()
RETURNS TABLE(kind text, id uuid, name text, status text, reservation_id uuid, starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'ESPACIO', s.id, s.name, s.status::text, NULL::uuid, NULL::timestamptz, NULL::timestamptz
    FROM public.spaces s WHERE s.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO')
  UNION ALL
  SELECT 'RECURSO', r.id, r.name, r.status::text, NULL, NULL, NULL
    FROM public.resources r WHERE r.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO')
  UNION ALL
  SELECT 'ESPACIO', s.id, s.name, 'RESERVADO', x.id, x.starts_at, x.ends_at
    FROM public.reservations x JOIN public.spaces s ON s.id = x.space_id
    WHERE x.status IN ('APROBADA','EN_CURSO') AND x.ends_at >= now()
  UNION ALL
  SELECT 'RECURSO', r.id, r.name || ' x' || rr.quantity, 'RESERVADO', x.id, x.starts_at, x.ends_at
    FROM public.reservations x JOIN public.reservation_resources rr ON rr.reservation_id = x.id
    JOIN public.resources r ON r.id = rr.resource_id
    WHERE x.status IN ('APROBADA','EN_CURSO') AND x.ends_at >= now()
$$;

-- GET /api/quirofano/instrumental
CREATE OR REPLACE VIEW public.quirofano_instrumental WITH (security_invoker = true) AS
  SELECT k.id AS kit_id, k.name AS kit_name, k.status AS kit_status, k.last_regrouped_at,
    count(i.id) AS total_piezas,
    count(i.id) FILTER (WHERE i.status = 'DISPONIBLE') AS piezas_disponibles,
    coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'code',i.code,'status',i.status))
      FILTER (WHERE i.id IS NOT NULL), '[]') AS piezas
  FROM public.surgical_kits k LEFT JOIN public.surgical_instruments i ON i.kit_id = k.id
  GROUP BY k.id;
GRANT SELECT ON public.quirofano_instrumental TO authenticated;

-- GET /api/reportes/utilizacion
CREATE OR REPLACE FUNCTION public.reporte_utilizacion(_from timestamptz, _to timestamptz)
RETURNS TABLE(kind text, id uuid, name text, reservas bigint, horas numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
  SELECT 'ESPACIO'::text, s.id, s.name, count(x.id),
    round(coalesce(sum(extract(epoch FROM x.ends_at - x.starts_at))/3600,0)::numeric,1)
  FROM public.spaces s LEFT JOIN public.reservations x ON x.space_id = s.id
    AND x.status IN ('APROBADA','EN_CURSO') AND x.starts_at >= _from AND x.starts_at < _to
  GROUP BY s.id
  UNION ALL
  SELECT 'RECURSO', r.id, r.name, count(x.id),
    round(coalesce(sum(rr.quantity * extract(epoch FROM x.ends_at - x.starts_at))/3600,0)::numeric,1)
  FROM public.resources r LEFT JOIN public.reservation_resources rr ON rr.resource_id = r.id
    LEFT JOIN public.reservations x ON x.id = rr.reservation_id
    AND x.status IN ('APROBADA','EN_CURSO') AND x.starts_at >= _from AND x.starts_at < _to
  GROUP BY r.id;
END $$;

-- Alertas de reservas próximas (para llamar periódicamente o desde la app)
CREATE OR REPLACE FUNCTION public.generar_alertas_proximas()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.alerts(user_id, reservation_id, kind, message)
  SELECT x.teacher_id, x.id, 'PROXIMA', 'Tu reserva inicia el ' || to_char(x.starts_at AT TIME ZONE 'America/Bogota','YYYY-MM-DD HH24:MI')
  FROM public.reservations x
  WHERE x.status = 'APROBADA' AND x.starts_at BETWEEN now() AND now() + interval '24 hours'
    AND NOT EXISTS (SELECT 1 FROM public.alerts a WHERE a.reservation_id = x.id AND a.kind = 'PROXIMA');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.check_resource_conflicts(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generar_alertas_proximas() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generar_alertas_proximas() TO authenticated;

-- ===== Datos iniciales =====
INSERT INTO public.spaces(name,type,capacity,open_time,close_time) VALUES
 ('Sala de Simulación 1','FIJO',20,'07:00','19:00'),
 ('Sala de Simulación 2','FIJO',15,'07:00','19:00'),
 ('Quirófano Simulado','FIJO',10,'07:00','18:00'),
 ('Unidad Móvil','MOVIL',12,'08:00','17:00');
INSERT INTO public.resource_categories(name,kind) VALUES
 ('Equipos','EQUIPO'),('Simuladores','SIMULADOR'),('Insumos','INSUMO'),('Paquetes quirúrgicos','PAQUETE_QUIRURGICO');
INSERT INTO public.resources(category_id,name,code,quantity_total,allows_external_exit)
SELECT c.id, v.name, v.code, v.qty, v.ext FROM (VALUES
 ('Equipos','Monitor de signos vitales','EQ-001',4,true),
 ('Equipos','Desfibrilador','EQ-002',2,false),
 ('Simuladores','Simulador RCP adulto','SIM-001',6,true),
 ('Simuladores','Brazo de venopunción','SIM-002',8,true),
 ('Insumos','Guantes estériles (par)','INS-001',200,true),
 ('Insumos','Gasas (paquete)','INS-002',150,true),
 ('Paquetes quirúrgicos','Paquete de cirugía menor','PQ-001',3,false)
) AS v(cat,name,code,qty,ext) JOIN public.resource_categories c ON c.name = v.cat;
INSERT INTO public.activities(name,description,default_duration_minutes) VALUES
 ('RCP básica','Reanimación cardiopulmonar en adulto',120),
 ('Venopunción','Canalización venosa periférica',90),
 ('Sutura cirugía menor','Práctica de sutura en quirófano simulado',180);
INSERT INTO public.activity_resource_templates(activity_id,resource_id,quantity)
SELECT a.id, r.id, v.q FROM (VALUES
 ('RCP básica','SIM-001',3),('RCP básica','EQ-002',1),('RCP básica','INS-001',10),
 ('Venopunción','SIM-002',4),('Venopunción','INS-001',20),('Venopunción','INS-002',10),
 ('Sutura cirugía menor','PQ-001',2),('Sutura cirugía menor','INS-001',20),('Sutura cirugía menor','EQ-001',1)
) AS v(act,code,q) JOIN public.activities a ON a.name = v.act JOIN public.resources r ON r.code = v.code;
INSERT INTO public.surgical_kits(resource_id,name,status,last_regrouped_at)
SELECT id, 'Paquete cirugía menor #' || g, 'COMPLETO', now() FROM public.resources, generate_series(1,3) g WHERE code = 'PQ-001' AND g = 1;
INSERT INTO public.surgical_kits(name,status) VALUES ('Paquete cirugía menor #2','COMPLETO'),('Paquete cirugía menor #3','SEPARADO');
INSERT INTO public.surgical_instruments(kit_id,name,code)
SELECT k.id, p.name, left(k.name,1) || substr(md5(k.id::text || p.name),1,6)
FROM public.surgical_kits k CROSS JOIN (VALUES ('Pinza Kelly'),('Pinza Allis'),('Porta agujas'),('Tijera Metzenbaum'),('Mango de bisturí')) p(name);
