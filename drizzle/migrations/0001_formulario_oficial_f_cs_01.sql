CREATE TYPE public.lugar_tipo AS ENUM ('LDS','CEAPH','LL','AM');
CREATE TYPE public.am_subtipo AS ENUM ('AOE','TA','PR');

ALTER TABLE public.reservations
  ADD COLUMN fecha_solicitud timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN facultad_entidad text DEFAULT 'Medicina',
  ADD COLUMN programa text DEFAULT 'Medicina',
  ADD COLUMN semestre integer,
  ADD COLUMN telefono_contacto text,
  ADD COLUMN solicitante_nombre text,
  ADD COLUMN solicitante_documento text,
  ADD COLUMN docente_responsable_nombre text,
  ADD COLUMN docente_responsable_documento text,
  ADD COLUMN lugar_tipo public.lugar_tipo NOT NULL DEFAULT 'LDS',
  ADD COLUMN aulas_moviles_subtipo public.am_subtipo,
  ADD COLUMN requiere_ingreso_30min_antes boolean NOT NULL DEFAULT false;

ALTER TABLE public.reservation_resources ADD COLUMN cantidad_aprobada integer;

CREATE TABLE public.activity_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  dia text NOT NULL,
  modulo text NOT NULL,
  estacion text,
  item text NOT NULL,
  cantidad numeric,
  cantidad_texto text,
  excluido boolean NOT NULL DEFAULT false,
  motivo_exclusion text,
  orden integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.activity_checklists TO authenticated;
GRANT ALL ON public.activity_checklists TO service_role;
ALTER TABLE public.activity_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lectura autenticados" ON public.activity_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin gestiona" ON public.activity_checklists FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR')) WITH CHECK (public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'));

-- Regla 19:00 con mensaje oficial + regla aulas móviles 30 min
CREATE OR REPLACE FUNCTION public.validate_reservation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.spaces; ls timestamp; le timestamp;
BEGIN
  SELECT * INTO s FROM public.spaces WHERE id = NEW.space_id;
  ls := NEW.starts_at AT TIME ZONE 'America/Bogota';
  le := NEW.ends_at AT TIME ZONE 'America/Bogota';
  IF NEW.status IN ('SOLICITADA','APROBADA') THEN
    IF ls::date <> le::date THEN RAISE EXCEPTION 'La reserva debe iniciar y terminar el mismo día'; END IF;
    IF le::time > '19:00'::time THEN
      RAISE EXCEPTION 'El horario solicitado supera el límite operativo permitido (19:00 hrs). Requiere autorización especial.';
    END IF;
    IF ls::time < s.open_time OR le::time > s.close_time THEN
      RAISE EXCEPTION 'Horario fuera del rango del espacio % (% - %)', s.name, s.open_time, s.close_time;
    END IF;
    IF NEW.participants > s.capacity THEN RAISE EXCEPTION 'El espacio % tiene capacidad para % personas', s.name, s.capacity; END IF;
    IF s.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO') THEN RAISE EXCEPTION 'El espacio % no está disponible (%)', s.name, s.status; END IF;
  END IF;
  IF NEW.lugar_tipo = 'AM' AND NEW.aulas_moviles_subtipo IS NULL THEN
    RAISE EXCEPTION 'Para aulas móviles (AM) indique el subtipo: AOE, TA o PR';
  END IF;
  IF NEW.lugar_tipo <> 'AM' THEN NEW.aulas_moviles_subtipo := NULL; END IF;
  NEW.requiere_ingreso_30min_antes := (NEW.lugar_tipo = 'AM' OR s.type = 'MOVIL');
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.updated_at := now(); NEW.updated_by := auth.uid();
    IF NEW.status = 'CANCELADA' AND OLD.status <> 'CANCELADA' THEN NEW.cancelled_by := auth.uid(); NEW.cancelled_at := now(); END IF;
    IF NEW.status <> OLD.status AND NEW.status <> 'CANCELADA'
       AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN
      RAISE EXCEPTION 'Solo un administrador revisor puede cambiar el estado a %', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Plantilla del formulario oficial por módulo (solo ítems estándar convalidados)
CREATE OR REPLACE FUNCTION public.formulario_plantilla(_activity_id uuid)
 RETURNS TABLE(resource_id uuid, detalle text, cantidad integer, categoria public.resource_kind)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT r.id, r.name, t.quantity, c.kind
  FROM public.activity_resource_templates t
  JOIN public.resources r ON r.id = t.resource_id
  JOIN public.resource_categories c ON c.id = r.category_id
  WHERE t.activity_id = _activity_id
  ORDER BY c.kind, r.name
$$;

-- Crear solicitud con la estructura completa del formulario F-CS-01
CREATE OR REPLACE FUNCTION public.crear_solicitud_formulario(_f jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE new_id uuid; it jsonb; std integer; nota text; lt public.lugar_tipo; sp public.spaces;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesión'; END IF;
  lt := COALESCE(_f->>'lugar_tipo','LDS')::public.lugar_tipo;
  INSERT INTO public.reservations(teacher_id, space_id, activity_id, starts_at, ends_at, participants, leaves_faculty, notes,
    facultad_entidad, programa, semestre, telefono_contacto, solicitante_nombre, solicitante_documento,
    docente_responsable_nombre, docente_responsable_documento, lugar_tipo, aulas_moviles_subtipo)
  VALUES (auth.uid(), (_f->>'space_id')::uuid, (_f->>'activity_id')::uuid, (_f->>'starts_at')::timestamptz, (_f->>'ends_at')::timestamptz,
    COALESCE((_f->>'participants')::int,1), COALESCE((_f->>'leaves_faculty')::boolean,false), _f->>'notes',
    COALESCE(_f->>'facultad_entidad','Medicina'), COALESCE(_f->>'programa','Medicina'), NULLIF(_f->>'semestre','')::int,
    _f->>'telefono_contacto', _f->>'solicitante_nombre', _f->>'solicitante_documento',
    _f->>'docente_responsable_nombre', _f->>'docente_responsable_documento', lt,
    NULLIF(_f->>'aulas_moviles_subtipo','')::public.am_subtipo)
  RETURNING id INTO new_id;

  IF jsonb_typeof(_f->'items') = 'array' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(_f->'items') LOOP
      CONTINUE WHEN COALESCE((it->>'cantidad')::int,0) <= 0;
      SELECT quantity INTO std FROM public.activity_resource_templates
        WHERE activity_id = (_f->>'activity_id')::uuid AND resource_id = (it->>'resource_id')::uuid;
      IF std IS NOT NULL AND (it->>'cantidad')::int > std THEN
        RAISE EXCEPTION 'La cantidad solicitada supera el estándar del módulo (máx. %)', std;
      END IF;
      INSERT INTO public.reservation_resources(reservation_id, resource_id, quantity)
      VALUES (new_id, (it->>'resource_id')::uuid, (it->>'cantidad')::int);
    END LOOP;
  ELSE
    INSERT INTO public.reservation_resources(reservation_id, resource_id, quantity)
    SELECT new_id, t.resource_id, t.quantity FROM public.activity_resource_templates t WHERE t.activity_id = (_f->>'activity_id')::uuid;
  END IF;

  IF COALESCE((_f->>'leaves_faculty')::boolean,false) THEN
    INSERT INTO public.external_borrow_forms(reservation_id) VALUES (new_id);
  END IF;

  SELECT * INTO sp FROM public.spaces WHERE id = (_f->>'space_id')::uuid;
  IF lt = 'AM' OR sp.type = 'MOVIL' THEN
    nota := 'Nota: Para aulas móviles o equipos, el docente responsable debe estar media hora antes de la práctica.';
    INSERT INTO public.reservation_audit(reservation_id, action, actor_id, details)
    VALUES (new_id, 'NOTA_INGRESO_30MIN', auth.uid(), jsonb_build_object('nota', nota));
    INSERT INTO public.alerts(user_id, reservation_id, kind, message) VALUES (auth.uid(), new_id, 'NOTA', nota);
  END IF;
  RETURN jsonb_build_object('id', new_id, 'nota', nota);
END $$;

GRANT EXECUTE ON FUNCTION public.formulario_plantilla(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_formulario(jsonb) TO authenticated;

-- Reporte de uso por programa y docente
CREATE OR REPLACE FUNCTION public.reporte_uso_programa_docente(_from timestamptz, _to timestamptz)
 RETURNS TABLE(programa text, docente text, reservas bigint, horas numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
  SELECT COALESCE(x.programa,'—'), COALESCE(x.docente_responsable_nombre, p.full_name, p.email, '—'), count(*),
    round((sum(extract(epoch FROM x.ends_at - x.starts_at))/3600)::numeric,1)
  FROM public.reservations x LEFT JOIN public.profiles p ON p.id = x.teacher_id
  WHERE x.status IN ('APROBADA','EN_CURSO') AND x.starts_at >= _from AND x.starts_at < _to
  GROUP BY 1,2 ORDER BY 1,2;
END $$;
GRANT EXECUTE ON FUNCTION public.reporte_uso_programa_docente(timestamptz,timestamptz) TO authenticated;