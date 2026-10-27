ALTER TABLE public.reservations ALTER COLUMN space_id DROP NOT NULL;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS transport_vehicle text, ADD COLUMN IF NOT EXISTS inventory_detail text;

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_no_overlap_space
  EXCLUDE USING gist (space_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('APROBADA','EN_CURSO') AND space_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.validate_reservation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.spaces; ls timestamp; le timestamp;
BEGIN
  IF NEW.space_id IS NOT NULL THEN SELECT * INTO s FROM public.spaces WHERE id = NEW.space_id; END IF;
  ls := NEW.starts_at AT TIME ZONE 'America/Bogota';
  le := NEW.ends_at AT TIME ZONE 'America/Bogota';
  IF TG_OP = 'INSERT' THEN
    IF ls::date < (now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'No se pueden solicitar reservas en fechas pasadas'; END IF;
    IF NEW.facultad_entidad NOT IN ('Facultad de Medicina','Facultad de Enfermería','Medicina','Enfermería') THEN
      RAISE EXCEPTION 'Facultad no permitida: solo Medicina o Enfermería';
    END IF;
  END IF;
  IF NEW.status IN ('SOLICITADA','APROBADA') THEN
    IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'La hora de fin debe ser posterior a la de inicio'; END IF;
    IF ls::date <> le::date THEN RAISE EXCEPTION 'La reserva debe iniciar y terminar el mismo día'; END IF;
    IF le::time > '19:00'::time THEN
      RAISE EXCEPTION 'El horario solicitado supera el límite operativo permitido (19:00 hrs). Requiere autorización especial.';
    END IF;
    IF s.id IS NOT NULL THEN
      IF ls::time < s.open_time OR le::time > s.close_time THEN
        RAISE EXCEPTION 'Horario fuera del rango del espacio % (% - %)', s.name, s.open_time, s.close_time;
      END IF;
      IF NEW.participants > s.capacity THEN RAISE EXCEPTION 'El espacio % tiene capacidad para % personas', s.name, s.capacity; END IF;
      IF s.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO') THEN RAISE EXCEPTION 'El espacio % no está disponible (%)', s.name, s.status; END IF;
    END IF;
  END IF;
  IF NEW.status = 'APROBADA' AND NEW.space_id IS NULL THEN RAISE EXCEPTION 'Debe asignar un espacio antes de aprobar'; END IF;
  IF NEW.lugar_tipo = 'AM' AND NEW.aulas_moviles_subtipo IS NULL THEN
    RAISE EXCEPTION 'Para aulas móviles (AM) indique el subtipo: AOE, TA o PR';
  END IF;
  IF NEW.lugar_tipo <> 'AM' THEN NEW.aulas_moviles_subtipo := NULL; END IF;
  NEW.requiere_ingreso_30min_antes := (NEW.lugar_tipo = 'AM' OR COALESCE(s.type::text,'') = 'MOVIL');
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

CREATE OR REPLACE FUNCTION public.crear_solicitud_formulario(_f jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE new_id uuid; it jsonb; std integer; sal jsonb; ext boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesión'; END IF;
  sal := _f->'salida';
  ext := sal IS NOT NULL AND jsonb_typeof(sal) = 'object';
  INSERT INTO public.reservations(teacher_id, space_id, activity_id, starts_at, ends_at, participants, leaves_faculty, notes,
    facultad_entidad, programa, semestre, telefono_contacto, solicitante_nombre, solicitante_documento,
    docente_responsable_nombre, docente_responsable_documento, lugar_tipo)
  VALUES (auth.uid(), NULL, (_f->>'activity_id')::uuid, (_f->>'starts_at')::timestamptz, (_f->>'ends_at')::timestamptz,
    COALESCE((_f->>'participants')::int,1), ext, _f->>'notes',
    COALESCE(_f->>'facultad_entidad','Facultad de Medicina'), COALESCE(_f->>'programa','Medicina'), NULLIF(_f->>'semestre','')::int,
    _f->>'telefono_contacto', _f->>'solicitante_nombre', _f->>'solicitante_documento',
    _f->>'docente_responsable_nombre', _f->>'docente_responsable_documento', 'LDS')
  RETURNING id INTO new_id;

  IF jsonb_typeof(_f->'items') = 'array' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(_f->'items') LOOP
      CONTINUE WHEN COALESCE((it->>'cantidad')::int,0) <= 0;
      SELECT quantity INTO std FROM public.activity_resource_templates
        WHERE activity_id = (_f->>'activity_id')::uuid AND resource_id = (it->>'resource_id')::uuid;
      IF std IS NULL THEN RAISE EXCEPTION 'Recurso fuera de la lista estándar del módulo'; END IF;
      IF (it->>'cantidad')::int > std THEN RAISE EXCEPTION 'La cantidad solicitada supera el estándar del módulo (máx. %)', std; END IF;
      INSERT INTO public.reservation_resources(reservation_id, resource_id, quantity)
      VALUES (new_id, (it->>'resource_id')::uuid, (it->>'cantidad')::int);
    END LOOP;
  END IF;

  IF ext THEN
    INSERT INTO public.external_borrow_forms(reservation_id, destination, responsible_name, responsible_document, responsible_phone,
      transport_vehicle, departure_at, return_at, inventory_detail, purpose, accepts_responsibility)
    VALUES (new_id, sal->>'destination', sal->>'responsible_name', sal->>'responsible_document', sal->>'responsible_phone',
      sal->>'transport_vehicle', NULLIF(sal->>'departure_at','')::timestamptz, NULLIF(sal->>'return_at','')::timestamptz,
      sal->>'inventory_detail', sal->>'purpose', COALESCE((sal->>'accepts_responsibility')::boolean,false));
  END IF;
  RETURN jsonb_build_object('id', new_id);
END $function$;

CREATE OR REPLACE FUNCTION public.aprobar_reserva_con_espacio(_id uuid, _space_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.reservations;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF r.status <> 'SOLICITADA' THEN RAISE EXCEPTION 'Solo se aprueban reservas SOLICITADAS (actual: %)', r.status; END IF;
  IF _space_id IS NULL THEN RAISE EXCEPTION 'Debe asignar un espacio antes de aprobar'; END IF;
  IF r.leaves_faculty AND NOT public.external_form_complete(_id) THEN
    RAISE EXCEPTION 'El formulario de salida externa está incompleto';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservations x WHERE x.space_id = _space_id AND x.id <> r.id
     AND x.status IN ('APROBADA','EN_CURSO')
     AND tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(r.starts_at,r.ends_at,'[)')) THEN
    RAISE EXCEPTION 'Cruce de horario: el espacio ya está reservado en ese rango';
  END IF;
  UPDATE public.reservations SET space_id = _space_id, status = 'APROBADA', reviewer_id = auth.uid() WHERE id = _id;
  PERFORM public.check_resource_conflicts(_id);
END $function$;
GRANT EXECUTE ON FUNCTION public.aprobar_reserva_con_espacio(uuid, uuid) TO authenticated;

CREATE TABLE public.reservation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  mensaje text NOT NULL CHECK (length(trim(mensaje)) > 0 AND length(mensaje) <= 2000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.reservation_messages(reservation_id, created_at);
GRANT SELECT, INSERT ON public.reservation_messages TO authenticated;
GRANT ALL ON public.reservation_messages TO service_role;
ALTER TABLE public.reservation_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.puede_ver_reserva(_rid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR')
  OR EXISTS (SELECT 1 FROM public.reservations WHERE id = _rid AND teacher_id = auth.uid()) $$;

CREATE POLICY "Participantes leen mensajes" ON public.reservation_messages FOR SELECT TO authenticated
  USING (public.puede_ver_reserva(reservation_id));
CREATE POLICY "Participantes envían mensajes" ON public.reservation_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.puede_ver_reserva(reservation_id));

CREATE OR REPLACE FUNCTION public.marcar_mensajes_leidos(_rid uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  IF NOT public.puede_ver_reserva(_rid) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE public.reservation_messages SET read_at = now()
   WHERE reservation_id = _rid AND sender_id <> auth.uid() AND read_at IS NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.marcar_mensajes_leidos(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.reservation_messages;