-- 1. Permitir aprobar solicitudes de Préstamo y Salida Externa (leaves_faculty = true) sin asignar salón físico
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
    IF NOT NEW.leaves_faculty THEN
      IF ls::date <> le::date THEN RAISE EXCEPTION 'La reserva interna debe iniciar y terminar el mismo día'; END IF;
      IF le::time > '19:00'::time THEN
        RAISE EXCEPTION 'El horario solicitado supera el límite operativo permitido (19:00 hrs). Requiere autorización especial.';
      END IF;
    END IF;
    IF s.id IS NOT NULL THEN
      IF ls::time < s.open_time OR le::time > s.close_time THEN
        RAISE EXCEPTION 'Horario fuera del rango del espacio % (% - %)', s.name, s.open_time, s.close_time;
      END IF;
      IF NEW.participants > s.capacity THEN RAISE EXCEPTION 'El espacio % tiene capacidad para % personas', s.name, s.capacity; END IF;
      IF s.status IN ('EN_MANTENIMIENTO','FUERA_DE_SERVICIO') THEN RAISE EXCEPTION 'El espacio % no está disponible (%)', s.name, s.status; END IF;
    END IF;
  END IF;
  IF NEW.status = 'APROBADA' AND NEW.space_id IS NULL AND NOT NEW.leaves_faculty THEN
    RAISE EXCEPTION 'Debe asignar un espacio antes de aprobar';
  END IF;
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
-- 2. RPC unificada para aprobar Préstamo y Salida Externa sin asignar salón ni abrir calendario
CREATE OR REPLACE FUNCTION public.aprobar_prestamo_externo(
  _reservation_id uuid,
  _form_id uuid,
  _autoriza jsonb,
  _items jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  r public.reservations;
  f public.external_borrow_forms;
  v_inicio timestamptz;
  v_fin timestamptz;
  rec record;
  disp int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMINISTRADOR_REVISOR') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT * INTO r FROM public.reservations WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT r.leaves_faculty THEN RAISE EXCEPTION 'Esta solicitud no corresponde a salida externa'; END IF;
  IF r.status NOT IN ('SOLICITADA', 'APROBADA') THEN
    RAISE EXCEPTION 'No se puede aprobar en estado %', r.status;
  END IF;
  SELECT * INTO f FROM public.external_borrow_forms WHERE id = _form_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Formulario de salida externa no encontrado'; END IF;
  v_inicio := COALESCE(f.departure_at, r.starts_at);
  v_fin := COALESCE(f.return_at, r.ends_at);
  FOR rec IN
    SELECT rr.resource_id, COALESCE(rr.cantidad_aprobada, rr.quantity) AS q, res.name
    FROM public.reservation_resources rr
    JOIN public.resources res ON res.id = rr.resource_id
    WHERE rr.reservation_id = r.id
  LOOP
    disp := public.recurso_disponible(rec.resource_id, v_inicio, v_fin, r.id);
    IF rec.q > disp THEN
      RAISE EXCEPTION 'El dispositivo % no tiene unidades libres suficientes en ese periodo (solicitado: %, disponible: %).', rec.name, rec.q, disp;
    END IF;
  END LOOP;
  UPDATE public.reservations
  SET status = 'APROBADA',
      reviewer_id = auth.uid(),
      salida_estado = COALESCE(salida_estado, 'AUTORIZADA')
  WHERE id = _reservation_id;
  UPDATE public.external_borrow_forms
  SET estado = 'SALIDA_APROBADA',
      autoriza_nombre = _autoriza->>'nombre',
      autoriza_cargo = _autoriza->>'cargo',
      autoriza_telefono = _autoriza->>'telefono',
      autoriza_correo = _autoriza->>'correo',
      observaciones = COALESCE(NULLIF(_autoriza->>'observaciones', ''), observaciones),
      items = COALESCE(_items, items),
      decidido_at = now(),
      decidido_por = auth.uid()
  WHERE id = _form_id;
END $fn$;
-- 3. RPC unificada para rechazar Préstamo y Salida Externa
CREATE OR REPLACE FUNCTION public.rechazar_prestamo_externo(
  _reservation_id uuid,
  _form_id uuid,
  _motivo text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMINISTRADOR_REVISOR') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF length(trim(coalesce(_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'Debe indicar el motivo del rechazo';
  END IF;
  UPDATE public.reservations
  SET status = 'RECHAZADA',
      reviewer_id = auth.uid(),
      rejection_reason = trim(_motivo)
  WHERE id = _reservation_id AND status IN ('SOLICITADA', 'APROBADA');
  IF _form_id IS NOT NULL THEN
    UPDATE public.external_borrow_forms
    SET estado = 'SALIDA_RECHAZADA',
        observaciones = trim(_motivo),
        decidido_at = now(),
        decidido_por = auth.uid()
    WHERE id = _form_id;
  END IF;
END $fn$;
GRANT EXECUTE ON FUNCTION public.aprobar_prestamo_externo(uuid, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rechazar_prestamo_externo(uuid, uuid, text) TO authenticated;