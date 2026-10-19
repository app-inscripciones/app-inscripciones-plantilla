-- =====================================================================
-- Etapa 4.2 · Panel de control del evento
-- Se ejecuta UNA VEZ en el editor SQL de Supabase (SQL Editor → Run),
-- después de 001 a 004. Se puede volver a ejecutar sin problemas.
--
--  · rendiciones: entregas de efectivo de cada cargador (se registran en la 4.3).
--  · panel_resumen: inscriptos, dinero y efectivo por cargador (R9).
--  · panel_inscripciones: lista para consultar, con búsqueda.
--  Lo ven todos los roles del panel. Solo cuenta lo que ya llegó a la base.
-- =====================================================================

create table if not exists public.rendiciones (
  id            uuid primary key default gen_random_uuid(),
  evento_id     text not null references public.eventos (id),
  cargador      text not null,                      -- nombre del colaborador (como figura en inscripciones)
  monto         integer not null check (monto > 0),
  entregado_en  timestamptz not null default now(),
  recibido_por  text not null,                      -- correo del Tesorero
  observacion   text,
  anulada       boolean not null default false,
  anulada_motivo text,
  creado_en     timestamptz not null default now()
);
create index if not exists rendiciones_evento_idx on public.rendiciones (evento_id, cargador);
alter table public.rendiciones enable row level security;
revoke all on public.rendiciones from anon, authenticated;

-- ¿Tiene algún rol del panel?
create or replace function public.puede_ver_panel()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select cardinality(public.mis_roles()) > 0;
$$;
revoke all on function public.puede_ver_panel() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- PANEL · eventos que se pueden ver
-- ---------------------------------------------------------------------
create or replace function public.panel_eventos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return jsonb_build_object('ok', true, 'eventos', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nombre', e.nombre, 'fecha', e.fecha, 'estado', e.estado, 'unidad', e.unidad,
      'categorias', coalesce(e.definicion -> 'categorias', '[]'::jsonb),
      'campos', coalesce(e.definicion -> 'campos', '[]'::jsonb)
    ) order by e.fecha desc)
    from public.eventos e where e.estado <> 'borrador'), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_eventos() from public;
grant execute on function public.panel_eventos() to authenticated;

-- ---------------------------------------------------------------------
-- PANEL · resumen del evento
--  Efectivo a rendir = efectivo cobrado (inscripciones no anuladas) − rendiciones no anuladas.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- PANEL · lista de inscripciones (más recientes primero), con búsqueda
--  p_buscar: parte del nombre, DNI, teléfono o número de orden.
--  p_filtro: 'todas' | 'revisar' (posible duplicado o fuera de horario) | 'anuladas'
-- ---------------------------------------------------------------------
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
        'duplicadoDe', (select d.numero_orden from public.inscripciones d where d.id = i.duplicado_de)
      ) as x
      from public.inscripciones i
      where i.evento_id = p_evento
        and (p_filtro <> 'revisar' or ((i.estado = 'posible_duplicado' or i.fuera_de_horario) and i.estado <> 'anulada'))
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

select 'Etapa 4.2 instalada' as resultado;
