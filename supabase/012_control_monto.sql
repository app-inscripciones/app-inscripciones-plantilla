-- =====================================================================
-- D51 · Control del monto en el servidor
-- La app del cargador calcula lo que hay que cobrar; ahora la base lo vuelve a calcular con los precios
-- del evento (categoría, conceptos con su condición y precio según la fecha de carga). Si no coincide,
-- la inscripción se guarda IGUAL (nunca se pierde un cobro) y queda «para revisar», con el monto esperado.
-- Se ejecuta después de 001 a 011. Se puede volver a ejecutar sin problemas.
-- =====================================================================

alter table public.inscripciones add column if not exists monto_esperado integer;
alter table public.inscripciones add column if not exists monto_revisar boolean not null default false;

-- ¿Se cumple una condición del evento? {campo, igual} · {campo, en:[...]} · {todas:[...]} · null = siempre.
create or replace function public.cumple_condicion(c jsonb, r jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  x jsonb;
begin
  if c is null or jsonb_typeof(c) = 'null' then return true; end if;
  if jsonb_typeof(c -> 'todas') = 'array' then
    for x in select * from jsonb_array_elements(c -> 'todas') loop
      if not public.cumple_condicion(x, r) then return false; end if;
    end loop;
    return true;
  end if;
  if c ? 'igual' then return coalesce(r -> (c ->> 'campo') = c -> 'igual', false); end if;
  if jsonb_typeof(c -> 'en') = 'array' then
    return r ? (c ->> 'campo') and (c -> 'en') @> jsonb_build_array(r -> (c ->> 'campo'));
  end if;
  return false;
end;
$$;

-- Lo que corresponde cobrar (igual que src/logica/precios.js). null = no se puede calcular (por ejemplo, falta la categoría).
create or replace function public.calcular_monto(d jsonb, p_categoria text, p_datos jsonb, p_dia date)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  r jsonb := coalesce(p_datos, '{}'::jsonb) || case when p_categoria is null then '{}'::jsonb else jsonb_build_object('categoria', p_categoria) end;
  limpias jsonb := '{}'::jsonb;
  campo jsonb; k jsonb; t jsonb; tramo jsonb;
  total integer := 0;
  m jsonb;
begin
  if jsonb_array_length(coalesce(d -> 'categorias', '[]'::jsonb)) > 0 then
    if p_categoria is null then return null; end if;
    limpias := jsonb_build_object('categoria', p_categoria);
  end if;
  -- Solo cuentan las respuestas de preguntas visibles.
  for campo in select * from jsonb_array_elements(coalesce(d -> 'campos', '[]'::jsonb)) loop
    if public.cumple_condicion(campo -> 'visibleSi', r) and r ? (campo ->> 'id') and coalesce(r ->> (campo ->> 'id'), '') <> '' then
      limpias := limpias || jsonb_build_object(campo ->> 'id', r -> (campo ->> 'id'));
    end if;
  end loop;
  for k in select * from jsonb_array_elements(coalesce(d -> 'conceptos', '[]'::jsonb)) loop
    if not public.cumple_condicion(k -> 'aplicaSi', limpias) then continue; end if;
    tramo := null;
    for t in select * from jsonb_array_elements(k -> 'precios') loop
      if coalesce(t ->> 'hasta', '') = '' or p_dia <= (t ->> 'hasta')::date then tramo := t; exit; end if;
    end loop;
    if tramo is null then continue; end if;
    m := case when jsonb_typeof(tramo -> 'monto') = 'number' then tramo -> 'monto'
              when tramo ? 'porCategoria' then tramo -> 'porCategoria' -> p_categoria end;
    if m is null or jsonb_typeof(m) <> 'number' then continue; end if;
    total := total + (m #>> '{}')::integer;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------
-- Funciones anteriores, actualizadas para D51
-- ---------------------------------------------------------------------
create or replace function public.enviar_inscripcion(p_token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ses     uuid;
  v_acc     public.accesos;
  v_ev      public.eventos;
  v_cargador text;
  v_id      uuid;
  v_nro     bigint;
  v_clave   text;
  v_dup     uuid;
  v_creada  timestamptz;
  v_fuera   boolean;
  margen    constant interval := interval '10 minutes';
  v_esperado integer;
begin
  if p is null or length(p::text) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  v_ses := public.sesion_de_token(p_token);
  if v_ses is null then
    return jsonb_build_object('ok', false, 'error', 'sesion_invalida');
  end if;
  select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
  if v_acc.tarea <> 'cargar' then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  update public.sesiones set ultima_conexion = now() where id = v_ses;
  select * into v_ev from public.eventos where id = v_acc.evento_id;
  select nombre into v_cargador from public.colaboradores where id = v_acc.colaborador_id;

  -- D45: «sin cobro» solo en eventos sin conceptos de cobro, y con monto 0.
  if (p->'pago'->>'medio' = 'sin_cobro') is distinct from (jsonb_array_length(coalesce(v_ev.definicion -> 'conceptos', '[]'::jsonb)) = 0)
     or (p->'pago'->>'medio' = 'sin_cobro' and coalesce((p->>'monto')::numeric, -1) <> 0) then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;

  -- D51: el servidor vuelve a calcular el monto con los precios del evento. Si no coincide, la inscripción
  -- se guarda IGUAL (no se pierde un cobro), marcada para revisar.
  begin
    v_esperado := public.calcular_monto(v_ev.definicion, nullif(p->>'categoria', ''), coalesce(p->'datos', '{}'::jsonb), (p->>'diaCarga')::date);
  exception when others then v_esperado := null;
  end;

  begin
    v_id := (p->>'id')::uuid;
    v_creada := (p->>'creadaEn')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end;

  select numero_orden into v_nro from public.inscripciones where id = v_id;
  if found then
    return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', true);
  end if;

  v_fuera := v_creada < v_acc.desde - margen
          or v_creada > least(v_acc.hasta, coalesce(v_acc.cerrado_en, v_acc.hasta)) + margen
          or v_creada > now() + margen
          or v_creada > v_ev.inscripciones_cerradas_en + margen;   -- cargada después de cerrar las inscripciones (D46)
  v_fuera := coalesce(v_fuera, false);

  v_clave := coalesce(
    nullif(regexp_replace(coalesce(p->'datos'->>'dni', ''), '\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(p->'datos'->>'telefono', ''), '\D', '', 'g'), '')
  );
  if v_clave is not null then
    select i.id into v_dup
    from public.inscripciones i
    where i.evento_id = v_ev.id
      and i.estado <> 'anulada'
      and coalesce(
            nullif(regexp_replace(coalesce(i.datos->>'dni', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(i.datos->>'telefono', ''), '\D', '', 'g'), '')
          ) = v_clave
    order by i.numero_orden
    limit 1;
  end if;

  begin
    insert into public.inscripciones (
      id, evento_id, cargador, dispositivo, creada_en_local, dia_carga, categoria,
      datos, conceptos, monto, medio_pago, banco, ultimos6, estado, duplicado_de,
      sesion_id, fuera_de_horario, monto_esperado, monto_revisar
    ) values (
      v_id, v_ev.id, v_cargador, p->>'dispositivo', v_creada, (p->>'diaCarga')::date,
      nullif(p->>'categoria', ''),
      coalesce(p->'datos', '{}'::jsonb), coalesce(p->'conceptos', '[]'::jsonb),
      (p->>'monto')::integer, p->'pago'->>'medio',
      nullif(trim(p->'pago'->>'banco'), ''), nullif(p->'pago'->>'ultimos6', ''),
      case when v_dup is null then 'activa' else 'posible_duplicado' end, v_dup,
      v_ses, v_fuera, v_esperado, v_esperado is distinct from (p->>'monto')::integer
    )
    on conflict (id) do nothing
    returning numero_orden into v_nro;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end;

  if v_nro is null then
    select numero_orden into v_nro from public.inscripciones where id = v_id;
    return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', true);
  end if;

  return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', false,
                            'posibleDuplicado', v_dup is not null, 'fueraDeHorario', v_fuera,
                            'montoARevisar', v_esperado is distinct from (p->>'monto')::integer);
end;
$$;
revoke all on function public.enviar_inscripcion(text, jsonb) from public;
grant execute on function public.enviar_inscripcion(text, jsonb) to anon, authenticated;

create or replace function public.panel_inscripciones(p_evento text, p_buscar text default '', p_filtro text default 'todas', p_limite integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b text := translate(lower(trim(coalesce(p_buscar, ''))), 'áéíóúüñ', 'aeiouun');
  bnum text := regexp_replace(coalesce(p_buscar, ''), '\D', '', 'g');
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return jsonb_build_object('ok', true, 'inscripciones', coalesce((
    select jsonb_agg(x order by (x->>'numeroOrden')::bigint desc) from (
      select jsonb_build_object(
        'id', i.id, 'numeroOrden', i.numero_orden, 'cargador', i.cargador, 'creadaEn', i.creada_en_local,
        'recibidaEn', i.recibida_en, 'categoria', i.categoria, 'datos', i.datos, 'conceptos', i.conceptos,
        'monto', i.monto, 'medioPago', i.medio_pago, 'banco', i.banco, 'ultimos6', i.ultimos6,
        'estado', i.estado, 'fueraDeHorario', i.fuera_de_horario,
        'montoRevisar', i.monto_revisar, 'montoEsperado', i.monto_esperado,
        'duplicadoDe', (select d.numero_orden from public.inscripciones d where d.id = i.duplicado_de)
      ) as x
      from public.inscripciones i
      where i.evento_id = p_evento
        and (p_filtro <> 'revisar' or ((i.estado = 'posible_duplicado' or i.fuera_de_horario or i.monto_revisar) and i.estado <> 'anulada'))
        and (p_filtro <> 'anuladas' or i.estado = 'anulada')
        and (b = ''
             or translate(lower((select string_agg(v, ' ') from jsonb_each_text(i.datos) as t(k, v))), 'áéíóúüñ', 'aeiouun') like '%' || b || '%'
             or (length(bnum) >= 3 and regexp_replace((select string_agg(v, ' ') from jsonb_each_text(i.datos) as t(k, v)), '\D', '', 'g') like '%' || bnum || '%')
             or i.numero_orden::text = bnum)
      order by i.numero_orden desc
      limit greatest(1, least(coalesce(p_limite, 200), 1000))
    ) t), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_inscripciones(text, text, text, integer) from public;
grant execute on function public.panel_inscripciones(text, text, text, integer) to authenticated;

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
    'paraRevisar', (select count(*) from ins where estado = 'posible_duplicado' or fuera_de_horario or monto_revisar),
    'dinero', jsonb_build_object(
      'total', (select coalesce(sum(monto), 0) from ins),
      'efectivo', (select coalesce(sum(monto), 0) from ins where medio_pago = 'efectivo'),
      'terminal', (select coalesce(sum(monto), 0) from ins where medio_pago = 'terminal'),
      'transferencia', (select coalesce(sum(monto), 0) from ins where medio_pago = 'transferencia'),
      'rendido', (select coalesce(sum(monto), 0) from public.rendiciones where evento_id = p_evento and not anulada)
    ),
    'porCargador', coalesce((select jsonb_agg(jsonb_build_object(
        'cargador', cargador, 'inscripciones', inscripciones, 'total', total, 'efectivo', efectivo,
        'terminal', terminal, 'transferencia', transferencia, 'rendido', rendido,
        'aRendir', efectivo - rendido, 'ultimaConexion', ultima_conexion) order by cargador) from por_cargador), '[]'::jsonb),
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
    monto_revisar = false,
    revisada_por = public.correo_actual()
  where id = p_id;
  perform public.auditar('marcar_revisada', 'inscripcion', p_id::text,
    jsonb_build_object('estado', v_ins.estado, 'fueraDeHorario', v_ins.fuera_de_horario, 'montoRevisar', v_ins.monto_revisar),
    jsonb_build_object('estado', case when v_ins.estado = 'posible_duplicado' then 'activa' else v_ins.estado end,
                       'fueraDeHorario', false, 'motivo', nullif(trim(coalesce(p_motivo, '')), '')));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_marcar_revisada(uuid, text) from public;
grant execute on function public.panel_marcar_revisada(uuid, text) to authenticated;

-- Permisos (ver 011): las internas, cerradas.
revoke execute on function public.cumple_condicion(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.calcular_monto(jsonb, text, jsonb, date) from public, anon, authenticated;

select 'Control del monto instalado' as resultado;
