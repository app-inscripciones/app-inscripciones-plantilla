-- =====================================================================
-- Etapa 4.3 a 4.5 · Rendiciones, correcciones, revisiones y Excel
-- Se ejecuta UNA VEZ en el editor SQL de Supabase (SQL Editor → Run),
-- después de 001 a 005. Se puede volver a ejecutar sin problemas.
--
--  · Tesorero: registra y anula rendiciones de efectivo (R10).
--  · Organizador: corrige datos y medio de pago (no el monto, D40), anula
--    inscripciones y marca como revisadas las «posible duplicado» / «fuera de horario».
--  · Todo queda en la auditoría, con el antes y el después y el motivo.
--  · Exportación completa para el Excel (D10), para todos los roles del panel.
-- =====================================================================

alter table public.inscripciones add column if not exists revisada_por text;
alter table public.inscripciones add column if not exists anulada_motivo text;

-- ---------------------------------------------------------------------
-- 4.3 · RENDICIONES (Tesorero)
-- ---------------------------------------------------------------------
create or replace function public.panel_registrar_rendicion(p_evento text, p_cargador text, p_monto integer, p_observacion text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cobrado bigint;
  v_rendido bigint;
begin
  if not public.tengo_rol('tesorero') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if not exists (select 1 from public.eventos where id = p_evento) then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if p_monto is null or p_monto <= 0 or p_monto > 100000000 then return jsonb_build_object('ok', false, 'error', 'monto_invalido'); end if;
  if coalesce(trim(p_cargador), '') = '' then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;

  insert into public.rendiciones (evento_id, cargador, monto, recibido_por, observacion)
  values (p_evento, trim(p_cargador), p_monto, public.correo_actual(), nullif(trim(coalesce(p_observacion, '')), ''))
  returning id into v_id;

  select coalesce(sum(monto), 0) into v_cobrado from public.inscripciones
   where evento_id = p_evento and cargador = trim(p_cargador) and estado <> 'anulada' and medio_pago = 'efectivo';
  select coalesce(sum(monto), 0) into v_rendido from public.rendiciones
   where evento_id = p_evento and cargador = trim(p_cargador) and not anulada;

  perform public.auditar('registrar_rendicion', 'rendicion', v_id::text, null,
    jsonb_build_object('evento', p_evento, 'cargador', trim(p_cargador), 'monto', p_monto, 'observacion', p_observacion));
  return jsonb_build_object('ok', true, 'id', v_id, 'aRendir', v_cobrado - v_rendido);
end;
$$;
revoke all on function public.panel_registrar_rendicion(text, text, integer, text) from public;
grant execute on function public.panel_registrar_rendicion(text, text, integer, text) to authenticated;

create or replace function public.panel_anular_rendicion(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
begin
  if not public.tengo_rol('tesorero') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'falta_motivo'); end if;
  select to_jsonb(r) into v_antes from public.rendiciones r where id = p_id and not anulada;
  if v_antes is null then return jsonb_build_object('ok', false, 'error', 'no_encontrada'); end if;
  update public.rendiciones set anulada = true, anulada_motivo = trim(p_motivo) where id = p_id;
  perform public.auditar('anular_rendicion', 'rendicion', p_id::text, v_antes, jsonb_build_object('anulada', true, 'motivo', trim(p_motivo)));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_anular_rendicion(uuid, text) from public;
grant execute on function public.panel_anular_rendicion(uuid, text) to authenticated;

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
      'id', r.id, 'cargador', r.cargador, 'monto', r.monto, 'entregadoEn', r.entregado_en,
      'recibidoPor', coalesce((select u.nombre from public.usuarios u where u.email = r.recibido_por), r.recibido_por),
      'observacion', r.observacion, 'anulada', r.anulada, 'anuladaMotivo', r.anulada_motivo
    ) order by r.entregado_en desc)
    from public.rendiciones r where r.evento_id = p_evento), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_rendiciones(text) from public;
grant execute on function public.panel_rendiciones(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4.4 · CORRECCIONES, ANULACIONES Y REVISIONES (Organizador)
-- ---------------------------------------------------------------------
-- Corrige datos personales/respuestas y medio de pago. El monto NO se toca (D40).
create or replace function public.panel_corregir_inscripcion(
  p_id uuid, p_datos jsonb, p_medio text, p_banco text, p_ultimos6 text, p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins public.inscripciones;
  v_ult text := upper(regexp_replace(coalesce(p_ultimos6, ''), '[^A-Za-z0-9]', '', 'g'));
  v_datos jsonb;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'falta_motivo'); end if;
  select * into v_ins from public.inscripciones where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_encontrada'); end if;
  if v_ins.estado = 'anulada' then return jsonb_build_object('ok', false, 'error', 'anulada'); end if;
  if p_medio not in ('efectivo', 'terminal', 'transferencia') then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;
  if p_medio = 'transferencia' and (coalesce(trim(p_banco), '') = '' or v_ult !~ '^[A-Z0-9]{6}$') then
    return jsonb_build_object('ok', false, 'error', 'transferencia_incompleta');
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' or length(p_datos::text) > 10000 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  -- Solo se cambian campos que ya existen en la inscripción o en el formulario del evento.
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_datos
  from jsonb_each(v_ins.datos || p_datos) as t(k, v)
  where v_ins.datos ? k
     or exists (select 1 from public.eventos e, jsonb_array_elements(e.definicion -> 'campos') c
                where e.id = v_ins.evento_id and c ->> 'id' = k);

  update public.inscripciones set
    datos = v_datos,
    medio_pago = p_medio,
    banco = case when p_medio = 'transferencia' then trim(p_banco) else null end,
    ultimos6 = case when p_medio = 'transferencia' then v_ult else null end
  where id = p_id;

  perform public.auditar('corregir_inscripcion', 'inscripcion', p_id::text,
    jsonb_build_object('datos', v_ins.datos, 'medio', v_ins.medio_pago, 'banco', v_ins.banco, 'ultimos6', v_ins.ultimos6),
    jsonb_build_object('datos', v_datos, 'medio', p_medio,
      'banco', case when p_medio = 'transferencia' then trim(p_banco) end,
      'ultimos6', case when p_medio = 'transferencia' then v_ult end, 'motivo', trim(p_motivo)));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_corregir_inscripcion(uuid, jsonb, text, text, text, text) from public;
grant execute on function public.panel_corregir_inscripcion(uuid, jsonb, text, text, text, text) to authenticated;

create or replace function public.panel_anular_inscripcion(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins public.inscripciones;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'falta_motivo'); end if;
  select * into v_ins from public.inscripciones where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_encontrada'); end if;
  if v_ins.estado = 'anulada' then return jsonb_build_object('ok', false, 'error', 'anulada'); end if;
  update public.inscripciones set estado = 'anulada', anulada_motivo = trim(p_motivo) where id = p_id;
  perform public.auditar('anular_inscripcion', 'inscripcion', p_id::text,
    jsonb_build_object('estado', v_ins.estado, 'monto', v_ins.monto, 'medio', v_ins.medio_pago),
    jsonb_build_object('estado', 'anulada', 'motivo', trim(p_motivo)));
  return jsonb_build_object('ok', true, 'efectivoDescontado', case when v_ins.medio_pago = 'efectivo' then v_ins.monto else 0 end);
end;
$$;
revoke all on function public.panel_anular_inscripcion(uuid, text) from public;
grant execute on function public.panel_anular_inscripcion(uuid, text) to authenticated;

-- «No es duplicado» / «Fuera de horario aceptada»: la inscripción queda normal.
create or replace function public.panel_marcar_revisada(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins public.inscripciones;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v_ins from public.inscripciones where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_encontrada'); end if;
  if v_ins.estado = 'anulada' then return jsonb_build_object('ok', false, 'error', 'anulada'); end if;
  update public.inscripciones set
    estado = case when estado = 'posible_duplicado' then 'activa' else estado end,
    fuera_de_horario = false,
    revisada_por = public.correo_actual()
  where id = p_id;
  perform public.auditar('marcar_revisada', 'inscripcion', p_id::text,
    jsonb_build_object('estado', v_ins.estado, 'fueraDeHorario', v_ins.fuera_de_horario),
    jsonb_build_object('estado', case when v_ins.estado = 'posible_duplicado' then 'activa' else v_ins.estado end,
                       'fueraDeHorario', false, 'motivo', nullif(trim(coalesce(p_motivo, '')), '')));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_marcar_revisada(uuid, text) from public;
grant execute on function public.panel_marcar_revisada(uuid, text) to authenticated;

-- Historial de cambios de una inscripción o rendición (para ver quién hizo qué).
create or replace function public.panel_historial(p_entidad text, p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return jsonb_build_object('ok', true, 'cambios', coalesce((
    select jsonb_agg(jsonb_build_object('cuando', a.cuando,
      'quien', coalesce((select u.nombre from public.usuarios u where u.email = a.quien), a.quien),
      'accion', a.accion, 'antes', a.antes, 'despues', a.despues) order by a.cuando)
    from public.auditoria a where a.entidad = p_entidad and a.entidad_id = p_id), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_historial(text, text) from public;
grant execute on function public.panel_historial(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4.5 · EXPORTACIÓN COMPLETA PARA EL EXCEL (todos los roles del panel)
-- ---------------------------------------------------------------------
create or replace function public.panel_exportar(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  perform 1 from public.eventos where id = p_evento;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  return jsonb_build_object(
    'ok', true,
    'generado', now(),
    'resumen', public.panel_resumen(p_evento),
    'rendiciones', public.panel_rendiciones(p_evento) -> 'rendiciones',
    'inscripciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numeroOrden', i.numero_orden, 'creadaEn', i.creada_en_local, 'recibidaEn', i.recibida_en, 'cargador', i.cargador,
        'categoria', i.categoria, 'datos', i.datos, 'conceptos', i.conceptos, 'monto', i.monto, 'medioPago', i.medio_pago,
        'banco', i.banco, 'ultimos6', i.ultimos6, 'estado', i.estado, 'fueraDeHorario', i.fuera_de_horario,
        'anuladaMotivo', i.anulada_motivo,
        'duplicadoDe', (select d.numero_orden from public.inscripciones d where d.id = i.duplicado_de)
      ) order by i.numero_orden)
      from public.inscripciones i where i.evento_id = p_evento), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.panel_exportar(text) from public;
grant execute on function public.panel_exportar(text) to authenticated;

select 'Etapas 4.3 a 4.5 instaladas' as resultado;
