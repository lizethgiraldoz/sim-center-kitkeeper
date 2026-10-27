ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS maintenance_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS out_of_service_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE public.resources ADD CONSTRAINT resources_qty_chk
  CHECK (maintenance_quantity >= 0 AND out_of_service_quantity >= 0 AND maintenance_quantity + out_of_service_quantity <= quantity_total) NOT VALID;

CREATE OR REPLACE FUNCTION public.recurso_disponible(_resource_id uuid, _starts timestamptz, _ends timestamptz, _exclude uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN res.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO') THEN 0 ELSE
    GREATEST(0, res.quantity_total - res.maintenance_quantity - res.out_of_service_quantity -
    COALESCE((SELECT SUM(COALESCE(o.cantidad_aprobada, o.quantity)) FROM public.reservation_resources o
      JOIN public.reservations x ON x.id = o.reservation_id
      WHERE o.resource_id = res.id AND x.id IS DISTINCT FROM _exclude AND x.status IN ('APROBADA','EN_CURSO')
        AND tstzrange(x.starts_at, x.ends_at,'[)') && tstzrange(_starts,_ends,'[)')),0)::int) END
  FROM public.resources res WHERE res.id = _resource_id
$$;

CREATE OR REPLACE FUNCTION public.disponibilidad_plantilla(_activity_id uuid, _starts timestamptz, _ends timestamptz)
RETURNS TABLE(resource_id uuid, name text, disponible integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.resource_id, r.name, public.recurso_disponible(t.resource_id, _starts, _ends)
  FROM public.activity_resource_templates t JOIN public.resources r ON r.id = t.resource_id
  WHERE t.activity_id = _activity_id
$$;
GRANT EXECUTE ON FUNCTION public.disponibilidad_plantilla(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recurso_disponible(uuid, timestamptz, timestamptz, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_resource_conflicts(_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE r public.reservations; rec record; disp int;
BEGIN
  SELECT * INTO r FROM public.reservations WHERE id = _reservation_id;
  FOR rec IN SELECT rr.resource_id, COALESCE(rr.cantidad_aprobada, rr.quantity) AS q, res.name
    FROM public.reservation_resources rr JOIN public.resources res ON res.id = rr.resource_id WHERE rr.reservation_id = r.id
  LOOP
    disp := public.recurso_disponible(rec.resource_id, r.starts_at, r.ends_at, r.id);
    IF rec.q > disp THEN
      RAISE EXCEPTION 'El recurso % no tiene unidades disponibles en la fecha seleccionada debido a mantenimiento o fuera de servicio (solicitado %, disponible %).', rec.name, rec.q, disp;
    END IF;
  END LOOP;
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
  PERFORM public.check_resource_conflicts(new_id);

  IF ext THEN
    INSERT INTO public.external_borrow_forms(reservation_id, destination, responsible_name, responsible_document, responsible_phone,
      transport_vehicle, departure_at, return_at, inventory_detail, purpose, accepts_responsibility)
    VALUES (new_id, sal->>'destination', sal->>'responsible_name', sal->>'responsible_document', sal->>'responsible_phone',
      sal->>'transport_vehicle', NULLIF(sal->>'departure_at','')::timestamptz, NULLIF(sal->>'return_at','')::timestamptz,
      sal->>'inventory_detail', sal->>'purpose', COALESCE((sal->>'accepts_responsibility')::boolean,false));
  END IF;
  RETURN jsonb_build_object('id', new_id);
END $function$;