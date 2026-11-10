-- 1. Zona/piso en espacios
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS zona text NOT NULL DEFAULT 'PISO_2';

-- 2. Reestructura de espacios según Aforos 2026
UPDATE public.spaces SET name='Microcirugía (111)', capacity=8, zona='PISO_1' WHERE name='Sala de Simulación 1';
UPDATE public.spaces SET name='Consultorio (208)', capacity=8, zona='PISO_2' WHERE name='Sala de Simulación 2';
UPDATE public.spaces SET name='Macrosimulación (207) — sala completa', capacity=32, zona='PISO_2' WHERE name='Aula 207 – completa';
UPDATE public.spaces SET name='Sala Debriefing (209)', capacity=10, zona='PISO_2' WHERE name='Aula 209 – sala de apoyo';
UPDATE public.spaces SET name='Maternidad (210) — sala completa', capacity=24, zona='PISO_2' WHERE name='Aula 210 – completa';
UPDATE public.spaces SET name='Quirófano (307)', capacity=8, zona='PISO_3' WHERE name='Quirófano Simulado';
UPDATE public.spaces SET name='Sala de Situaciones (310)', capacity=20, zona='PISO_3' WHERE name='Aula 310';
UPDATE public.spaces SET zona='AULAS_MOVILES' WHERE type='MOVIL';

INSERT INTO public.spaces (name, type, capacity, open_time, close_time, status, zona, parent_space_id)
SELECT v.name, 'FIJO', v.capacity, '07:00', '19:00', 'DISPONIBLE', v.zona, v.parent_id
FROM (VALUES
  ('Macrosimulación (207) — Módulo 1', 8, 'PISO_2', (SELECT id FROM public.spaces WHERE name='Macrosimulación (207) — sala completa')),
  ('Macrosimulación (207) — Módulo 2', 8, 'PISO_2', (SELECT id FROM public.spaces WHERE name='Macrosimulación (207) — sala completa')),
  ('Macrosimulación (207) — Módulo 3', 8, 'PISO_2', (SELECT id FROM public.spaces WHERE name='Macrosimulación (207) — sala completa')),
  ('Macrosimulación (207) — Módulo 4', 8, 'PISO_2', (SELECT id FROM public.spaces WHERE name='Macrosimulación (207) — sala completa')),
  ('Maternidad (210) — Módulo 1', 8, 'PISO_2', (SELECT id FROM public.spaces WHERE name='Maternidad (210) — sala completa')),
  ('Maternidad (210) — Módulo 2', 8, 'PISO_2', (SELECT id FROM public.spaces WHERE name='Maternidad (210) — sala completa')),
  ('Maternidad (210) — Módulo 3', 8, 'PISO_2', (SELECT id FROM public.spaces WHERE name='Maternidad (210) — sala completa')),
  ('Maternidad (201) — un solo escenario', 25, 'PISO_2', NULL::uuid),
  ('Sectra (307)', 10, 'PISO_3', NULL::uuid),
  ('Laparoscopia (307)', 6, 'PISO_3', NULL::uuid),
  ('Sala Debriefing (309)', 10, 'PISO_3', NULL::uuid),
  ('Ecografía (310)', 10, 'PISO_3', NULL::uuid),
  ('Casa Simulada — Sala de Transmisión', 35, 'CASA_SIMULADA', NULL::uuid)
) AS v(name, capacity, zona, parent_id)
WHERE NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.name = v.name);

-- 3. Campos de inventario (placa y descripción)
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS numero_inventario text;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS descripcion text;

-- 4. Salida de bienes VA-SL-FO-010 en 2 etapas
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS correo_institucional text;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'PENDIENTE_AUTORIZACION_SALIDA';
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS autoriza_nombre text;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS autoriza_cargo text;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS autoriza_telefono text;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS autoriza_correo text;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS items jsonb;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS decidido_at timestamptz;
ALTER TABLE public.external_borrow_forms ADD COLUMN IF NOT EXISTS decidido_por uuid;

-- 5. Bloqueo de fechas pasadas (crear o cambiar fecha/hora)
CREATE OR REPLACE FUNCTION public.bloquear_fechas_pasadas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF (NEW.starts_at AT TIME ZONE 'America/Bogota')::date < (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'No se permiten reservas en fechas pasadas';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_bloquear_fechas_pasadas ON public.reservations;
CREATE TRIGGER trg_bloquear_fechas_pasadas BEFORE INSERT OR UPDATE OF starts_at, ends_at ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.bloquear_fechas_pasadas();

-- 6. Aprobación: valida aforo máximo y fecha pasada
CREATE OR REPLACE FUNCTION public.aprobar_reserva_con_espacio(_id uuid, _space_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE r public.reservations; cap integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF r.status <> 'SOLICITADA' THEN RAISE EXCEPTION 'Solo se aprueban reservas SOLICITADAS (actual: %)', r.status; END IF;
  IF _space_id IS NULL THEN RAISE EXCEPTION 'Debe asignar un espacio antes de aprobar'; END IF;
  IF (r.starts_at AT TIME ZONE 'America/Bogota')::date < (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'No se puede aprobar una reserva en una fecha pasada';
  END IF;
  SELECT capacity INTO cap FROM public.spaces WHERE id = _space_id;
  IF cap IS NULL THEN RAISE EXCEPTION 'Espacio no encontrado'; END IF;
  IF r.participants > cap THEN
    RAISE EXCEPTION 'Aforo insuficiente (Capacidad: % | Solicitados: %)', cap, r.participants;
  END IF;
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
END $fn$;

-- 7. Creación de solicitud: bloquea fechas pasadas y guarda cargo/correo de la salida
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
      transport_vehicle, departure_at, return_at, inventory_detail, purpose, accepts_responsibility, cargo, correo_institucional)
    VALUES (new_id, sal->>'destination', sal->>'responsible_name', sal->>'responsible_document', sal->>'responsible_phone',
      sal->>'transport_vehicle', NULLIF(sal->>'departure_at','')::timestamptz, NULLIF(sal->>'return_at','')::timestamptz,
      sal->>'inventory_detail', sal->>'purpose', COALESCE((sal->>'accepts_responsibility')::boolean,false),
      sal->>'cargo', sal->>'correo_institucional');
  END IF;
  RETURN jsonb_build_object('id', new_id);
END $fn$;

-- 8. Autorización de salida de bienes (etapa 2, administrador)
CREATE OR REPLACE FUNCTION public.autorizar_salida(_form_id uuid, _autoriza jsonb, _items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE f public.external_borrow_forms;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO f FROM public.external_borrow_forms WHERE id = _form_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud de salida no encontrada'; END IF;
  IF f.estado <> 'PENDIENTE_AUTORIZACION_SALIDA' THEN RAISE EXCEPTION 'Esta salida ya fue decidida (%)', f.estado; END IF;
  UPDATE public.external_borrow_forms SET
    estado = 'SALIDA_APROBADA',
    autoriza_nombre = _autoriza->>'nombre', autoriza_cargo = _autoriza->>'cargo',
    autoriza_telefono = _autoriza->>'telefono', autoriza_correo = _autoriza->>'correo',
    observaciones = COALESCE(NULLIF(_autoriza->>'observaciones',''), observaciones),
    items = COALESCE(_items, items),
    decidido_at = now(), decidido_por = auth.uid()
  WHERE id = _form_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rechazar_salida(_form_id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE f public.external_borrow_forms;
BEGIN
  IF NOT public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO f FROM public.external_borrow_forms WHERE id = _form_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud de salida no encontrada'; END IF;
  IF f.estado <> 'PENDIENTE_AUTORIZACION_SALIDA' THEN RAISE EXCEPTION 'Esta salida ya fue decidida (%)', f.estado; END IF;
  UPDATE public.external_borrow_forms SET
    estado = 'SALIDA_RECHAZADA', observaciones = _motivo, decidido_at = now(), decidido_por = auth.uid()
  WHERE id = _form_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.autorizar_salida(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rechazar_salida(uuid, text) TO authenticated;