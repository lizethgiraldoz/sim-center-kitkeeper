-- Tokens de notificaciones push (FCM) por usuario
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text not null unique,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;
alter table public.push_tokens enable row level security;
create policy "cada usuario gestiona sus tokens" on public.push_tokens for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reprogramar una reserva solicitada o aprobada (docente dueño o administrador)
create or replace function public.reprogramar_reserva(_id uuid, _starts_at timestamptz, _ends_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = _id;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if not (auth.uid() = r.teacher_id or public.has_role(auth.uid(), 'ADMINISTRADOR_REVISOR')) then
    raise exception 'No tienes permiso para reprogramar esta reserva';
  end if;
  if r.status not in ('SOLICITADA', 'APROBADA') then
    raise exception 'Solo se pueden reprogramar reservas solicitadas o aprobadas';
  end if;
  if _starts_at <= now() then
    raise exception 'La nueva fecha debe ser futura';
  end if;
  if _ends_at <= _starts_at then
    raise exception 'La hora de fin debe ser posterior a la de inicio';
  end if;
  if (_ends_at at time zone 'America/Bogota')::time > time '19:00' then
    raise exception 'El horario supera el límite operativo permitido (19:00 hrs)';
  end if;
  update public.reservations
    set starts_at = _starts_at, ends_at = _ends_at, updated_by = auth.uid(), updated_at = now()
    where id = _id;
  insert into public.reservation_audit (reservation_id, action, actor_id, old_status, new_status, details)
    values (_id, 'REPROGRAMADA', auth.uid(), r.status, r.status,
      jsonb_build_object(
        'antes', jsonb_build_object('starts_at', r.starts_at, 'ends_at', r.ends_at),
        'despues', jsonb_build_object('starts_at', _starts_at, 'ends_at', _ends_at)));
exception
  when exclusion_violation then
    raise exception 'El espacio ya está reservado en ese horario. Elige otra fecha u hora.';
end;
$$;
grant execute on function public.reprogramar_reserva(uuid, timestamptz, timestamptz) to authenticated;

-- Crear la misma solicitud varias semanas seguidas (recurrencia semanal)
create or replace function public.crear_reservas_recurrentes(_f jsonb, _semanas int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  creadas int := 0;
  errores text[] := '{}';
  f jsonb;
  s timestamptz;
  e timestamptz;
begin
  if _semanas is null or _semanas < 1 or _semanas > 16 then
    raise exception 'El número de semanas debe estar entre 1 y 16';
  end if;
  for i in 0.._semanas - 1 loop
    s := (_f ->> 'starts_at')::timestamptz + (i * interval '7 days');
    e := (_f ->> 'ends_at')::timestamptz + (i * interval '7 days');
    f := jsonb_set(jsonb_set(_f, '{starts_at}', to_jsonb(s)), '{ends_at}', to_jsonb(e));
    begin
      perform public.crear_solicitud_formulario(f);
      creadas := creadas + 1;
    exception when others then
      errores := errores || (to_char(s at time zone 'America/Bogota', 'YYYY-MM-DD') || ': ' || sqlerrm);
    end;
  end loop;
  return jsonb_build_object('creadas', creadas, 'errores', to_jsonb(errores));
end;
$$;
grant execute on function public.crear_reservas_recurrentes(jsonb, int) to authenticated;