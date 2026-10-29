ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS justificacion_cancelacion text;
CREATE OR REPLACE FUNCTION public.cancelar_reserva_justificada(_id uuid, _justificacion text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF length(trim(coalesce(_justificacion,''))) < 3 THEN RAISE EXCEPTION 'Debe escribir la justificación de la cancelación'; END IF;
  UPDATE public.reservations SET status = 'CANCELADA', justificacion_cancelacion = trim(_justificacion),
    cancelled_by = auth.uid(), cancelled_at = now()
  WHERE id = _id AND status IN ('SOLICITADA','APROBADA')
    AND (teacher_id = auth.uid() OR public.has_role(auth.uid(),'ADMINISTRADOR_REVISOR'));
  IF NOT FOUND THEN RAISE EXCEPTION 'No se puede cancelar esta reserva'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.cancelar_reserva_justificada(uuid, text) TO authenticated;