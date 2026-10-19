-- =====================================================================
-- Modalidad del evento: presencial, virtual o híbrido (R18, D57)
--  · En los híbridos, cada inscripción dice si participa en forma presencial o virtual
--    (pregunta fija «modalidad» del formulario) y el panel cuenta cuántos hay en cada una.
--  · Cupo presencial (capacidad del lugar), opcional. Aviso al 90 %. Cierre automático de la
--    modalidad presencial al llegar al 90, 95 o 100 % del cupo (configurable; o «no cerrar solo»).
--  · El Organizador puede cerrar o volver a abrir los lugares presenciales a mano y ampliar el cupo.
--  · Una inscripción presencial cargada sin internet DESPUÉS del cierre llega igual (nunca se pierde
--    un cobro), marcada «sobre el cupo» para revisar.
--  · La puerta trae solo a los presenciales; presentes y ausentes se cuentan sobre ellos.
-- Se ejecuta después de 001 a 014. Se puede volver a ejecutar sin problemas.
-- =====================================================================

alter table public.eventos add column if not exists cupo_presencial integer check (cupo_presencial is null or cupo_presencial between 1 and 1000000);
-- 0 = «no cerrar solo»; null = lo que dice la definición del evento.
alter table public.eventos add column if not exists cierre_presencial_pct integer check (cierre_presencial_pct is null or cierre_presencial_pct in (0, 90, 95, 100));
alter table public.eventos add column if not exists presenciales_cerradas_en timestamptz;
alter table public.eventos add column if not exists presenciales_cerradas_por text;
alter table public.inscripciones add column if not exists sobre_cupo boolean not null default false;

-- ---------------------------------------------------------------------
-- Estado del cupo presencial de un evento (lo usan el panel, el celular y el cierre automático)
-- ---------------------------------------------------------------------
create or replace function public.estado_cupo(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
  v_cupo integer;
  v_pct integer;
  v_pres integer;
  v_virt integer;
begin
  select * into v_ev from public.eventos where id = p_evento;
  if not found then return null; end if;
  v_cupo := coalesce(v_ev.cupo_presencial, (v_ev.definicion ->> 'cupoPresencial')::integer);
  v_pct := case when v_ev.cierre_presencial_pct = 0 then null
                else coalesce(v_ev.cierre_presencial_pct, (v_ev.definicion ->> 'cierrePresencialPct')::integer) end;
  -- Se cuentan personas: en los eventos por pareja, cada inscripción ocupa dos lugares.
  select count(*) filter (where coalesce(datos ->> 'modalidad', 'presencial') <> 'virtual') * (case when v_ev.unidad = 'pareja' then 2 else 1 end),
         count(*) filter (where datos ->> 'modalidad' = 'virtual') * (case when v_ev.unidad = 'pareja' then 2 else 1 end)
    into v_pres, v_virt
  from public.inscripciones where evento_id = p_evento and estado <> 'anulada';
  return jsonb_build_object(
    'modalidad', coalesce(v_ev.definicion ->> 'modalidad', 'presencial'),
    'presenciales', v_pres,
    'virtuales', v_virt,
    'cupo', v_cupo,
    'cierrePct', v_pct,
    'avisoPct', 90,
    'quedan', case when v_cupo is null then null else greatest(v_cupo - v_pres, 0) end,
    'cerradasEn', v_ev.presenciales_cerradas_en,
    'cerradasPor', v_ev.presenciales_cerradas_por);
end;
$$;
revoke all on function public.estado_cupo(text) from public, anon, authenticated;

-- Cierre automático: si el evento es híbrido, tiene cupo y cierre configurado, y se llegó al porcentaje.
create or replace function public.revisar_cupo(p_evento text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb := public.estado_cupo(p_evento);
begin
  if c is null or c ->> 'modalidad' <> 'hibrido' or c -> 'cupo' = 'null'::jsonb or c -> 'cierrePct' = 'null'::jsonb
     or c -> 'cerradasEn' <> 'null'::jsonb then return false; end if;
  if (c ->> 'presenciales')::integer >= ceil((c ->> 'cupo')::numeric * (c ->> 'cierrePct')::numeric / 100) then
    update public.eventos set presenciales_cerradas_en = now(),
           presenciales_cerradas_por = 'automático: se llegó al ' || (c ->> 'cierrePct') || ' % del cupo'
     where id = p_evento and presenciales_cerradas_en is null;
    if found then
      insert into public.auditoria (quien, accion, entidad, entidad_id, despues)
      values ('sistema', 'cerrar_presenciales', 'evento', p_evento, c);
      return true;
    end if;
  end if;
  return false;
end;
$$;
revoke all on function public.revisar_cupo(text) from public, anon, authenticated;

-- Al llegar cada inscripción: si es presencial y se cargó después del cierre, «sobre el cupo»;
-- después, se revisa si hay que cerrar los presenciales.
create or replace function public.tg_cupo_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cerradas timestamptz;
begin
  if coalesce(new.datos ->> 'modalidad', '') = 'presencial' then
    -- Las presenciales de un evento híbrido entran de a una (bloqueo de la fila del evento hasta que termina
    -- de guardarse, incluido el cierre automático). Sin esto, varias que llegan en el mismo instante del
    -- cierre lo veían «todavía abierto» (lo encontró el simulacro con 10 cargadores: herramientas/simulacro/cupo.py).
    -- Las virtuales y los eventos no híbridos no esperan.
    select presenciales_cerradas_en into v_cerradas from public.eventos
     where id = new.evento_id and definicion ->> 'modalidad' = 'hibrido'
     for no key update;
    if v_cerradas is not null and new.creada_en_local > v_cerradas then new.sobre_cupo := true; end if;
  end if;
  return new;
end;
$$;
create or replace function public.tg_cupo_despues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.datos ->> 'modalidad', '') = 'presencial' then perform public.revisar_cupo(new.evento_id); end if;
  return null;
end;
$$;
revoke all on function public.tg_cupo_antes() from public, anon, authenticated;
revoke all on function public.tg_cupo_despues() from public, anon, authenticated;
drop trigger if exists cupo_antes on public.inscripciones;
create trigger cupo_antes before insert on public.inscripciones for each row execute function public.tg_cupo_antes();
drop trigger if exists cupo_despues on public.inscripciones;
create trigger cupo_despues after insert on public.inscripciones for each row execute function public.tg_cupo_despues();

-- ---------------------------------------------------------------------
-- Organizador: cerrar o volver a abrir los lugares presenciales, y cambiar el cupo o el cierre automático.
--  p_accion: 'cerrar' | 'abrir' | 'cupo'. Para 'cupo': p_cupo (1 a 1.000.000) y p_pct (90, 95, 100; 0 = no cerrar solo).
-- ---------------------------------------------------------------------
create or replace function public.panel_presenciales(p_evento text, p_accion text, p_cupo integer default null, p_pct integer default null, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
  v_antes jsonb;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v_ev from public.eventos where id = p_evento for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if coalesce(v_ev.definicion ->> 'modalidad', 'presencial') <> 'hibrido' then return jsonb_build_object('ok', false, 'error', 'no_es_hibrido'); end if;
  v_antes := public.estado_cupo(p_evento);
  if p_accion = 'cerrar' then
    update public.eventos set presenciales_cerradas_en = now(),
           presenciales_cerradas_por = coalesce(public.correo_actual(), 'organizador') || coalesce(' · ' || nullif(trim(coalesce(p_motivo, '')), ''), '')
     where id = p_evento and presenciales_cerradas_en is null;
  elsif p_accion = 'abrir' then
    update public.eventos set presenciales_cerradas_en = null, presenciales_cerradas_por = null where id = p_evento;
  elsif p_accion = 'cupo' then
    if p_cupo is null or p_cupo not between 1 and 1000000 or coalesce(p_pct, -1) not in (0, 90, 95, 100) then
      return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
    end if;
    update public.eventos set cupo_presencial = p_cupo, cierre_presencial_pct = p_pct where id = p_evento;
    -- Si se habían cerrado solos y con el cupo nuevo ya no corresponde, se vuelven a abrir solos.
    if v_ev.presenciales_cerradas_por like 'automático%' and (p_pct = 0 or
       (v_antes ->> 'presenciales')::integer < ceil(p_cupo::numeric * p_pct / 100)) then
      update public.eventos set presenciales_cerradas_en = null, presenciales_cerradas_por = null where id = p_evento;
    end if;
    perform public.revisar_cupo(p_evento);
  else
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  perform public.auditar(p_accion || '_presenciales', 'evento', p_evento, v_antes,
    public.estado_cupo(p_evento) || jsonb_build_object('motivo', nullif(trim(coalesce(p_motivo, '')), '')));
  return jsonb_build_object('ok', true, 'cupo', public.estado_cupo(p_evento));
end;
$$;
revoke all on function public.panel_presenciales(text, text, integer, integer, text) from public, anon;
grant execute on function public.panel_presenciales(text, text, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- Versiones nuevas de funciones anteriores (iguales a su última versión, con la modalidad)
-- ---------------------------------------------------------------------

create or replace function public.problema_definicion(d jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  c jsonb; k jsonb; t jsonb; i jsonb; m jsonb;
  v_ids text[] := '{}';
  v_cats text[] := '{}';
begin
  if d is null or jsonb_typeof(d) <> 'object' then return 'sin definición'; end if;
  if length(d::text) > 100000 then return 'definición demasiado grande'; end if;
  if length(trim(coalesce(d ->> 'nombre', ''))) not between 3 and 120 then return 'nombre'; end if;
  if coalesce(d ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'fecha'; end if;
  if coalesce(d ->> 'unidad', '') not in ('persona', 'pareja') then return 'unidad'; end if;

  if jsonb_typeof(d -> 'categorias') <> 'array' then return 'categorias'; end if;
  for c in select * from jsonb_array_elements(d -> 'categorias') loop
    if coalesce(c ->> 'id', '') !~ '^[a-z][a-z0-9_]{0,39}$' or c ->> 'id' = any(v_cats)
       or length(trim(coalesce(c ->> 'nombre', ''))) < 2 then return 'categoría'; end if;
    v_cats := v_cats || (c ->> 'id');
  end loop;
  if cardinality(v_cats) = 1 then return 'una sola categoría'; end if;
  -- Las edades de las categorías no se pueden superponer (¿en cuál iría alguien de 60 si hay «31 a 60» y «60 a 120»?).
  if exists (
    select 1
    from jsonb_array_elements(d -> 'categorias') a, jsonb_array_elements(d -> 'categorias') b
    where a ->> 'id' < b ->> 'id'
      and jsonb_typeof(a -> 'edadMin') = 'number' and jsonb_typeof(a -> 'edadMax') = 'number'
      and jsonb_typeof(b -> 'edadMin') = 'number' and jsonb_typeof(b -> 'edadMax') = 'number'
      and (a ->> 'edadMin')::numeric <= (b ->> 'edadMax')::numeric
      and (b ->> 'edadMin')::numeric <= (a ->> 'edadMax')::numeric
  ) then return 'edades de categorías superpuestas'; end if;

  if jsonb_typeof(d -> 'campos') <> 'array' or jsonb_array_length(d -> 'campos') not between 1 and 60 then return 'campos'; end if;
  for c in select * from jsonb_array_elements(d -> 'campos') loop
    if coalesce(c ->> 'id', '') !~ '^[a-z][a-z0-9_]{0,39}$' or c ->> 'id' = any(v_ids) or c ->> 'id' = 'categoria' then return 'campo ' || coalesce(c ->> 'id', '?'); end if;
    if length(trim(coalesce(c ->> 'etiqueta', ''))) < 2 then return 'campo sin texto'; end if;
    if coalesce(c ->> 'tipo', '') not in ('texto', 'dni', 'telefono', 'numero', 'si_no', 'opcion') then return 'tipo de campo'; end if;
    if c ->> 'tipo' = 'opcion' and (jsonb_typeof(c -> 'opciones') <> 'array' or jsonb_array_length(c -> 'opciones') < 2) then return 'opciones'; end if;
    v_ids := v_ids || (c ->> 'id');
  end loop;
  if d ->> 'unidad' = 'persona' and not ('nombre' = any(v_ids)) then return 'falta el nombre'; end if;
  if d ->> 'unidad' = 'pareja' and not ('hombre' = any(v_ids) and 'mujer' = any(v_ids)) then return 'faltan los nombres de la pareja'; end if;

  -- Modalidad (R18): presencial (por defecto), virtual o híbrido.
  if coalesce(d ->> 'modalidad', 'presencial') not in ('presencial', 'virtual', 'hibrido') then return 'modalidad'; end if;
  if d ->> 'modalidad' = 'hibrido' then
    select x into m from jsonb_array_elements(d -> 'campos') x where x ->> 'id' = 'modalidad';
    if m is null or m ->> 'tipo' <> 'opcion' or not coalesce((m ->> 'obligatorio')::boolean, false)
       or (select array_agg(o ->> 'valor' order by o ->> 'valor') from jsonb_array_elements(m -> 'opciones') o) <> array['presencial', 'virtual']
      then return 'pregunta de modalidad'; end if;
    if d ? 'cupoPresencial' and jsonb_typeof(d -> 'cupoPresencial') <> 'null'
       and (jsonb_typeof(d -> 'cupoPresencial') <> 'number' or (d ->> 'cupoPresencial')::numeric not between 1 and 1000000
            or (d ->> 'cupoPresencial')::numeric <> trunc((d ->> 'cupoPresencial')::numeric)) then return 'cupo presencial'; end if;
    if d ? 'cierrePresencialPct' and jsonb_typeof(d -> 'cierrePresencialPct') <> 'null'
       and coalesce(d ->> 'cierrePresencialPct', '') not in ('90', '95', '100') then return 'cierre del cupo'; end if;
  elsif 'modalidad' = any(v_ids) then return 'pregunta de modalidad';
  end if;
  if d ->> 'modalidad' = 'virtual' and coalesce((d -> 'asistencia' ->> 'toma')::boolean, false) then return 'asistencia en evento virtual'; end if;

  -- Un evento sin cobro (D45) no tiene conceptos; los demás, al menos uno.
  if jsonb_typeof(d -> 'conceptos') <> 'array' then return 'conceptos'; end if;
  if coalesce((d ->> 'sinCobro')::boolean, false) then
    if jsonb_array_length(d -> 'conceptos') > 0 then return 'evento sin cobro con conceptos'; end if;
  elsif jsonb_array_length(d -> 'conceptos') < 1 then return 'conceptos'; end if;
  for k in select * from jsonb_array_elements(d -> 'conceptos') loop
    if length(trim(coalesce(k ->> 'nombre', ''))) < 2 then return 'concepto sin nombre'; end if;
    if jsonb_typeof(k -> 'precios') <> 'array' or jsonb_array_length(k -> 'precios') not between 1 and 2 then return 'precios'; end if;
    for t in select * from jsonb_array_elements(k -> 'precios') loop
      if t ? 'porCategoria' then
        for m in select value from jsonb_each(t -> 'porCategoria') loop
          if jsonb_typeof(m) <> 'number' or (m #>> '{}')::numeric < 0 or (m #>> '{}')::numeric <> trunc((m #>> '{}')::numeric) then return 'precio'; end if;
        end loop;
      elsif jsonb_typeof(t -> 'monto') <> 'number' or (t ->> 'monto')::numeric < 0 or (t ->> 'monto')::numeric <> trunc((t ->> 'monto')::numeric) then
        return 'precio';
      end if;
    end loop;
  end loop;

  if coalesce((d -> 'asistencia' ->> 'toma')::boolean, false) then
    if jsonb_typeof(d -> 'asistencia' -> 'instancias') <> 'array'
       or jsonb_array_length(d -> 'asistencia' -> 'instancias') not between 1 and 30 then return 'momentos de asistencia'; end if;
    for i in select * from jsonb_array_elements(d -> 'asistencia' -> 'instancias') loop
      if coalesce(i ->> 'id', '') = '' or length(trim(coalesce(i ->> 'nombre', ''))) < 2
         or coalesce(i ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'momento de asistencia'; end if;
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.problema_definicion(jsonb) from public, anon, authenticated;

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
      'practica', e.practica,
      'modalidad', coalesce(e.definicion ->> 'modalidad', 'presencial'),
      'cupoPresencial', coalesce(e.cupo_presencial, (e.definicion ->> 'cupoPresencial')::integer),
      'cierrePresencialPct', case when e.cierre_presencial_pct = 0 then null else coalesce(e.cierre_presencial_pct, (e.definicion ->> 'cierrePresencialPct')::integer) end,
      'presencialesCerradasEn', e.presenciales_cerradas_en, 'presencialesCerradasPor', e.presenciales_cerradas_por,
      'categorias', coalesce(e.definicion -> 'categorias', '[]'::jsonb),
      'campos', coalesce(e.definicion -> 'campos', '[]'::jsonb),
      'sinCobro', jsonb_array_length(coalesce(e.definicion -> 'conceptos', '[]'::jsonb)) = 0,
      'inscripcionesCerradasEn', e.inscripciones_cerradas_en, 'inscripcionesCerradasPor', e.inscripciones_cerradas_por
    ) order by e.practica, e.fecha desc)
    from public.eventos e where e.estado <> 'borrador'), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_eventos() from public, anon;
grant execute on function public.panel_eventos() to authenticated;

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
    'sobreCupo', (select count(*) from ins where sobre_cupo),
    'paraRevisar', (select count(*) from ins where estado = 'posible_duplicado' or fuera_de_horario or monto_revisar or sobre_cupo),
    'modalidad', public.estado_cupo(p_evento),
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
        'montoRevisar', i.monto_revisar, 'montoEsperado', i.monto_esperado, 'sobreCupo', i.sobre_cupo,
        'duplicadoDe', (select d.numero_orden from public.inscripciones d where d.id = i.duplicado_de)
      ) as x
      from public.inscripciones i
      where i.evento_id = p_evento
        and (p_filtro <> 'revisar' or ((i.estado = 'posible_duplicado' or i.fuera_de_horario or i.monto_revisar or i.sobre_cupo) and i.estado <> 'anulada'))
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
    sobre_cupo = false,
    revisada_por = public.correo_actual()
  where id = p_id;
  perform public.auditar('marcar_revisada', 'inscripcion', p_id::text,
    jsonb_build_object('estado', v_ins.estado, 'fueraDeHorario', v_ins.fuera_de_horario, 'montoRevisar', v_ins.monto_revisar, 'sobreCupo', v_ins.sobre_cupo),
    jsonb_build_object('estado', case when v_ins.estado = 'posible_duplicado' then 'activa' else v_ins.estado end,
                       'fueraDeHorario', false, 'motivo', nullif(trim(coalesce(p_motivo, '')), '')));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_marcar_revisada(uuid, text) from public;
grant execute on function public.panel_marcar_revisada(uuid, text) to authenticated;

create or replace function public.panel_presentes(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg jsonb := public.config_asistencia(p_evento);
  v_por_persona boolean := v_cfg ->> 'modoPareja' = 'individual';
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return jsonb_build_object(
    'ok', true,
    'asistencia', v_cfg,
    'esperados', (select count(*) * (case when v_por_persona then 2 else 1 end) from public.inscripciones i where i.evento_id = p_evento and i.estado <> 'anulada' and coalesce(i.datos ->> 'modalidad', 'presencial') <> 'virtual'),
    'porInstancia', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', inst ->> 'id', 'nombre', inst ->> 'nombre', 'fecha', inst ->> 'fecha',
        'presentes', (select count(*) from public.asistencias a join public.inscripciones i on i.id = a.inscripcion_id
                       where a.evento_id = p_evento and a.instancia = inst ->> 'id' and a.estado = 'presente' and i.estado <> 'anulada'),
        'porCategoria', coalesce((select jsonb_object_agg(coalesce(cat, ''), n) from (
            select i.categoria as cat, count(*) as n from public.asistencias a join public.inscripciones i on i.id = a.inscripcion_id
            where a.evento_id = p_evento and a.instancia = inst ->> 'id' and a.estado = 'presente' and i.estado <> 'anulada'
            group by i.categoria) x), '{}'::jsonb),
        'ausentes', coalesce((select jsonb_agg(jsonb_build_object('n', i.numero_orden,
              'nombre', coalesce(i.datos ->> 'nombre', concat_ws(' y ', i.datos ->> 'hombre', i.datos ->> 'mujer')),
              'categoria', i.categoria, 'telefono', i.datos ->> 'telefono') order by i.numero_orden)
            from public.inscripciones i
            where i.evento_id = p_evento and i.estado <> 'anulada' and coalesce(i.datos ->> 'modalidad', 'presencial') <> 'virtual'
              and not exists (select 1 from public.asistencias a where a.inscripcion_id = i.id and a.instancia = inst ->> 'id' and a.estado = 'presente')), '[]'::jsonb)
      ))
      from jsonb_array_elements(v_cfg -> 'instancias') inst), '[]'::jsonb),
    'marcas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'inscripcionId', a.inscripcion_id, 'instancia', a.instancia, 'persona', a.persona,
                                          'marcadaEn', a.marcada_en, 'marcadoPor', a.marcado_por))
      from public.asistencias a where a.evento_id = p_evento and a.estado = 'presente'), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.panel_presentes(text) from public;
grant execute on function public.panel_presentes(text) to authenticated;

create or replace function public.lista_puerta(p_token text, p_desde timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ses uuid := public.sesion_de_token(p_token);
  v_acc public.accesos;
  v_cfg jsonb;
  v_busq text[];
  v_proc text;
begin
  if v_ses is null then return jsonb_build_object('ok', false, 'error', 'sesion_invalida'); end if;
  select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
  if v_acc.tarea <> 'presentes' then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  update public.sesiones set ultima_conexion = now() where id = v_ses;
  v_cfg := public.config_asistencia(v_acc.evento_id);
  v_busq := coalesce((select array_agg(x) from jsonb_array_elements_text(v_cfg -> 'camposBusqueda') x), array['nombre', 'dni', 'hombre', 'mujer']);
  v_proc := v_cfg ->> 'campoProcedencia';

  return jsonb_build_object(
    'ok', true,
    'ahora', now(),
    'asistencia', v_cfg,
    'inscripciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'n', i.numero_orden,
        'datos', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each_text(i.datos) as t(k, v) where k = any(v_busq)),
        'categoria', i.categoria,
        'procedencia', case when v_proc is not null then i.datos ->> v_proc end,
        'anulada', i.estado = 'anulada',
        'virtual', i.datos ->> 'modalidad' = 'virtual'))
      from public.inscripciones i
      where i.evento_id = v_acc.evento_id and (p_desde is null or i.actualizada_en > p_desde - interval '5 seconds')), '[]'::jsonb),
    'marcas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'inscripcionId', m.inscripcion_id, 'instancia', m.instancia, 'persona', m.persona,
        'marcadaEn', m.marcada_en, 'marcadoPor', m.marcado_por, 'estado', m.estado))
      from public.asistencias m
      where m.evento_id = v_acc.evento_id and (p_desde is null or m.actualizada_en > p_desde - interval '5 seconds')
        and (p_desde is not null or m.estado = 'presente')), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.lista_puerta(text, timestamptz) from public;
grant execute on function public.lista_puerta(text, timestamptz) to anon, authenticated;

create or replace function public.estado_sesion(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ses uuid := public.sesion_de_token(p_token);
  v_acc public.accesos;
begin
  if v_ses is null then
    return jsonb_build_object('ok', false, 'error', 'sesion_invalida');
  end if;
  update public.sesiones set ultima_conexion = now() where id = v_ses;
  select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
  return jsonb_build_object('ok', true, 'ahora', now(), 'desde', v_acc.desde, 'hasta', v_acc.hasta, 'cerradoEn', v_acc.cerrado_en,
    'inscripcionesCerradasEn', (select inscripciones_cerradas_en from public.eventos where id = v_acc.evento_id),
    'presenciales', (select case when c ->> 'modalidad' = 'hibrido'
                                 then jsonb_build_object('cerradasEn', c -> 'cerradasEn', 'quedan', c -> 'quedan') end
                     from public.estado_cupo(v_acc.evento_id) c));
end;
$$;
revoke all on function public.estado_sesion(text) from public;
grant execute on function public.estado_sesion(text) to anon, authenticated;


select 'Modalidad instalada' as resultado,
       (select count(*) from public.eventos where definicion ->> 'modalidad' = 'hibrido') as eventos_hibridos;
