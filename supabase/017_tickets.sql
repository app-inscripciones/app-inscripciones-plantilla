-- =====================================================================
-- Rendición de los tickets de la terminal (P16 → D60)
-- Al rendir, el cargador entrega el efectivo Y los comprobantes en papel de los cobros con terminal.
--  · Cada rendición registra el efectivo y la cantidad de tickets entregados (puede ser solo una de las dos cosas).
--  · El resumen cuenta, por cargador, los tickets que tendría que entregar (un cobro con terminal = un ticket),
--    los ya entregados y los que faltan, igual que el efectivo.
-- Se ejecuta después de 001 a 016. Se puede volver a ejecutar sin problemas.
-- =====================================================================

alter table public.rendiciones add column if not exists tickets integer not null default 0;
do $$
declare c record;
begin
  -- El monto puede ser 0 si la entrega es solo de tickets.
  for c in select conname from pg_constraint where conrelid = 'public.rendiciones'::regclass and contype = 'c'
           and pg_get_constraintdef(oid) ~ 'monto > 0' and conname <> 'rendicion_con_algo' loop
    execute format('alter table public.rendiciones drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'rendicion_con_algo') then
    alter table public.rendiciones add constraint rendicion_con_algo
      check (monto >= 0 and tickets between 0 and 10000 and (monto > 0 or tickets > 0));
  end if;
end $$;

-- Registrar una entrega: efectivo y/o tickets. (Reemplaza a la versión de 006, que tenía un parámetro menos.)
drop function if exists public.panel_registrar_rendicion(text, text, integer, text);
create or replace function public.panel_registrar_rendicion(p_evento text, p_cargador text, p_monto integer, p_observacion text default null, p_tickets integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cobrado bigint;
  v_rendido bigint;
  v_tickets bigint;
  v_tickets_rendidos bigint;
  v_monto integer := coalesce(p_monto, 0);
  v_cant integer := coalesce(p_tickets, 0);
begin
  if not public.tengo_rol('tesorero') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if not exists (select 1 from public.eventos where id = p_evento) then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if v_monto < 0 or v_monto > 100000000 or v_cant < 0 or v_cant > 10000 or (v_monto = 0 and v_cant = 0) then
    return jsonb_build_object('ok', false, 'error', 'monto_invalido');
  end if;
  if coalesce(trim(p_cargador), '') = '' then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;

  insert into public.rendiciones (evento_id, cargador, monto, tickets, recibido_por, observacion)
  values (p_evento, trim(p_cargador), v_monto, v_cant, public.correo_actual(), nullif(trim(coalesce(p_observacion, '')), ''))
  returning id into v_id;

  select coalesce(sum(monto) filter (where medio_pago = 'efectivo'), 0), count(*) filter (where medio_pago = 'terminal')
    into v_cobrado, v_tickets
  from public.inscripciones where evento_id = p_evento and cargador = trim(p_cargador) and estado <> 'anulada';
  select coalesce(sum(monto), 0), coalesce(sum(tickets), 0) into v_rendido, v_tickets_rendidos
  from public.rendiciones where evento_id = p_evento and cargador = trim(p_cargador) and not anulada;

  perform public.auditar('registrar_rendicion', 'rendicion', v_id::text, null,
    jsonb_build_object('evento', p_evento, 'cargador', trim(p_cargador), 'monto', v_monto, 'tickets', v_cant, 'observacion', p_observacion));
  return jsonb_build_object('ok', true, 'id', v_id, 'aRendir', v_cobrado - v_rendido, 'ticketsPendientes', v_tickets - v_tickets_rendidos);
end;
$$;
revoke all on function public.panel_registrar_rendicion(text, text, integer, text, integer) from public, anon;
grant execute on function public.panel_registrar_rendicion(text, text, integer, text, integer) to authenticated;

-- Versiones nuevas (iguales a su última versión, con los tickets)

create or replace function public.panel_resumen(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if not exists (select 1 from public.eventos where id = p_evento) then
    return jsonb_build_object('ok', false, 'error', 'evento_inexistente');
  end if;

  with ins as (
    select * from public.inscripciones where evento_id = p_evento and estado <> 'anulada'
  ),
  cargadores as (
    select cargador from ins
    union select cargador from public.rendiciones where evento_id = p_evento and not anulada
  ),
  por_cargador as (
    select c.cargador,
      (select count(*) from ins i where i.cargador = c.cargador) as inscripciones,
      (select coalesce(sum(monto), 0) from ins i where i.cargador = c.cargador) as total,
      (select coalesce(sum(monto), 0) from ins i where i.cargador = c.cargador and medio_pago = 'efectivo') as efectivo,
      (select coalesce(sum(monto), 0) from ins i where i.cargador = c.cargador and medio_pago = 'terminal') as terminal,
      (select coalesce(sum(monto), 0) from ins i where i.cargador = c.cargador and medio_pago = 'transferencia') as transferencia,
      (select coalesce(sum(monto), 0) from public.rendiciones r where r.evento_id = p_evento and r.cargador = c.cargador and not r.anulada) as rendido,
      (select count(*) from ins i where i.cargador = c.cargador and medio_pago = 'terminal') as tickets_terminal,
      (select coalesce(sum(tickets), 0) from public.rendiciones r where r.evento_id = p_evento and r.cargador = c.cargador and not r.anulada) as tickets_rendidos,
      (select max(s.ultima_conexion) from public.sesiones s join public.accesos a on a.id = s.acceso_id
         join public.colaboradores co on co.id = a.colaborador_id
         where a.evento_id = p_evento and co.nombre = c.cargador) as ultima_conexion
    from cargadores c
  )
  select jsonb_build_object(
    'ok', true,
    'ahora', now(),
    'inscriptos', (select count(*) from ins),
    'personas', (select coalesce(sum(case when e.unidad = 'pareja' then 2 else 1 end), 0) from ins join public.eventos e on e.id = ins.evento_id),
    'anuladas', (select count(*) from public.inscripciones where evento_id = p_evento and estado = 'anulada'),
    'posiblesDuplicados', (select count(*) from ins where estado = 'posible_duplicado'),
    'fueraDeHorario', (select count(*) from ins where fuera_de_horario),
    'montoARevisar', (select count(*) from ins where monto_revisar),
    'sobreCupo', (select count(*) from ins where sobre_cupo),
    'paraRevisar', (select count(*) from ins where estado = 'posible_duplicado' or fuera_de_horario or monto_revisar or sobre_cupo),
    'modalidad', public.estado_cupo(p_evento),
    'dinero', jsonb_build_object(
      'total', (select coalesce(sum(monto), 0) from ins),
      'efectivo', (select coalesce(sum(monto), 0) from ins where medio_pago = 'efectivo'),
      'terminal', (select coalesce(sum(monto), 0) from ins where medio_pago = 'terminal'),
      'transferencia', (select coalesce(sum(monto), 0) from ins where medio_pago = 'transferencia'),
      'rendido', (select coalesce(sum(monto), 0) from public.rendiciones where evento_id = p_evento and not anulada),
      'ticketsTerminal', (select count(*) from ins where medio_pago = 'terminal'),
      'ticketsRendidos', (select coalesce(sum(tickets), 0) from public.rendiciones where evento_id = p_evento and not anulada)
    ),
    'porCargador', coalesce((select jsonb_agg(jsonb_build_object(
        'cargador', cargador, 'inscripciones', inscripciones, 'total', total, 'efectivo', efectivo,
        'terminal', terminal, 'transferencia', transferencia, 'rendido', rendido,
        'aRendir', efectivo - rendido, 'ultimaConexion', ultima_conexion,
        'ticketsTerminal', tickets_terminal, 'ticketsRendidos', tickets_rendidos, 'ticketsPendientes', tickets_terminal - tickets_rendidos
      ) order by cargador) from por_cargador), '[]'::jsonb),
    'porCategoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria, 'cantidad', n) order by categoria)
        from (select coalesce(categoria, '') as categoria, count(*) as n from ins group by 1) x), '[]'::jsonb),
    'porDia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia_carga, 'cantidad', n) order by dia_carga)
        from (select dia_carga, count(*) as n from ins group by 1) x), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;
revoke all on function public.panel_resumen(text) from public;
grant execute on function public.panel_resumen(text) to authenticated;

create or replace function public.panel_rendiciones(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return jsonb_build_object('ok', true, 'rendiciones', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'cargador', r.cargador, 'monto', r.monto, 'tickets', r.tickets, 'entregadoEn', r.entregado_en,
      'recibidoPor', coalesce((select u.nombre from public.usuarios u where u.email = r.recibido_por), r.recibido_por),
      'observacion', r.observacion, 'anulada', r.anulada, 'anuladaMotivo', r.anulada_motivo
    ) order by r.entregado_en desc)
    from public.rendiciones r where r.evento_id = p_evento), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_rendiciones(text) from public;
grant execute on function public.panel_rendiciones(text) to authenticated;

create or replace function public.version_base()
returns integer
language sql
immutable
as $$ select 17 $$;
revoke all on function public.version_base() from public, anon, authenticated;

select 'Tickets de terminal instalados' as resultado, public.version_base() as version;
