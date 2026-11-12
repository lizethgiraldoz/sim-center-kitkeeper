CREATE OR REPLACE FUNCTION public.crear_solicitud_formulario(_f jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE new_id uuid; it jsonb; std integer; sal jsonb; ext boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debe iniciar sesión'; END IF;
  IF ((_f->>'starts_at')::timestamptz AT TIME ZONE 'America/Bogota')::date < (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'No se pueden crear solicitudes en fechas pasadas';
  END IF;
  sal := _f->'salida';
  ext := sal IS NOT NULL AND jsonb_typeof(sal) = 'object';
  INSERT INTO public.reservations(
    teacher_id, space_id, activity_id, starts_at, ends_at, participants, leaves_faculty, notes,
    facultad_entidad, programa, semestre, telefono_contacto, solicitante_nombre, solicitante_documento,
    docente_responsable_nombre, docente_responsable_documento, lugar_tipo
  )
  VALUES (
    auth.uid(), NULL, (_f->>'activity_id')::uuid, (_f->>'starts_at')::timestamptz, (_f->>'ends_at')::timestamptz,
    COALESCE((_f->>'participants')::int, 1), ext, _f->>'notes',
    COALESCE(_f->>'facultad_entidad', 'Facultad de Medicina'), COALESCE(_f->>'programa', 'Medicina'), NULLIF(_f->>'semestre', '')::int,
    _f->>'telefono_contacto', _f->>'solicitante_nombre', _f->>'solicitante_documento',
    _f->>'docente_responsable_nombre', _f->>'docente_responsable_documento', 'LDS'
  )
  RETURNING id INTO new_id;
  IF jsonb_typeof(_f->'items') = 'array' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(_f->'items') LOOP
      CONTINUE WHEN COALESCE((it->>'cantidad')::int, 0) <= 0;
      IF NOT ext THEN
        SELECT quantity INTO std FROM public.activity_resource_templates
          WHERE activity_id = (_f->>'activity_id')::uuid AND resource_id = (it->>'resource_id')::uuid;
        IF std IS NULL THEN RAISE EXCEPTION 'Recurso fuera de la lista estándar del módulo'; END IF;
        IF (it->>'cantidad')::int > std THEN RAISE EXCEPTION 'La cantidad solicitada supera el estándar del módulo (máx. %)', std; END IF;
      ELSE
        IF NOT EXISTS (SELECT 1 FROM public.resources WHERE id = (it->>'resource_id')::uuid) THEN
          RAISE EXCEPTION 'El recurso seleccionado no existe en el inventario';
        END IF;
      END IF;
      INSERT INTO public.reservation_resources(reservation_id, resource_id, quantity)
      VALUES (new_id, (it->>'resource_id')::uuid, (it->>'cantidad')::int);
    END LOOP;
  END IF;
  PERFORM public.check_resource_conflicts(new_id);
  IF ext THEN
    INSERT INTO public.external_borrow_forms(
      reservation_id, destination, responsible_name, responsible_document, responsible_phone,
      transport_vehicle, departure_at, return_at, inventory_detail, purpose, accepts_responsibility,
      cargo, correo_institucional
    )
    VALUES (
      new_id, sal->>'destination', sal->>'responsible_name', sal->>'responsible_document', sal->>'responsible_phone',
      sal->>'transport_vehicle', NULLIF(sal->>'departure_at', '')::timestamptz, NULLIF(sal->>'return_at', '')::timestamptz,
      sal->>'inventory_detail', sal->>'purpose', COALESCE((sal->>'accepts_responsibility')::boolean, false),
      sal->>'cargo', sal->>'correo_institucional'
    );
  END IF;
  RETURN jsonb_build_object('id', new_id);
END $fn$;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_formulario(jsonb) TO authenticated;