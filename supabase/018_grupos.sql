-- =====================================================================
-- Inscripción por grupo (R19, D61)
--  · Además de «persona» y «pareja», un evento puede inscribir GRUPOS (equipos, familias…).
--    La definición del evento lleva  grupo: { nombre ('equipo', 'familia'…), min, max, cobro ('grupo' | 'integrante') }.
--    Las preguntas con  porIntegrante: true  se piden para cada integrante; las demás, una vez por grupo.
--    Preguntas fijas: «nombre_grupo» (del grupo) y «nombre» (de cada integrante).
--  · La inscripción guarda en datos ->'integrantes' la lista de integrantes: [{id:'i1', responsable:true, nombre, dni, categoria, …}].
--  · Unidad de inscripción ≠ personas: cada inscripción guarda cuántas personas son (columna «personas»):
--    persona = 1, pareja = 2, grupo = cantidad de integrantes. El cupo, el panel, la puerta y el Excel cuentan personas.
--  · Cobro: «un precio por grupo» (no depende de los integrantes) o «según cada integrante» (se suma el precio
--    de cada uno, que puede cambiar por categoría). La base lo vuelve a calcular igual que la app (D51).
--  · Duplicados: se controla el DNI de cada integrante contra todo el evento.
--  · Asistencia: «el grupo junto» o «cada integrante por separado» (persona = id del integrante).
--  · Correcciones (Organizador): reemplazar integrantes siempre; agregar o quitar dentro del mínimo y máximo solo si
--    el monto no cambia (si cambia, se anula y se carga de nuevo, D40).
-- Se ejecuta después de 001 a 017. Se puede volver a ejecutar sin problemas.
-- =====================================================================

alter table public.eventos drop constraint if exists eventos_unidad_check;
alter table public.eventos add constraint eventos_unidad_check check (unidad in ('persona', 'pareja', 'grupo'));

-- Marcas de asistencia por integrante: persona = '' | 'hombre' | 'mujer' | id del integrante (i1, i2…).
alter table public.asistencias drop constraint if exists asistencias_persona_check;
alter table public.asistencias add constraint asistencias_persona_check check (persona ~ '^(|hombre|mujer|i[0-9]{1,3})$');

-- ---------------------------------------------------------------------
-- Cuántas personas son en cada inscripción
-- ---------------------------------------------------------------------
create or replace function public.personas_de(p_unidad text, p_datos jsonb)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_unidad = 'pareja' then 2
    when p_unidad = 'grupo' then greatest(1, case when jsonb_typeof(p_datos -> 'integrantes') = 'array' then jsonb_array_length(p_datos -> 'integrantes') else 1 end)
    else 1 end;
$$;
revoke execute on function public.personas_de(text, jsonb) from public, anon, authenticated;

alter table public.inscripciones add column if not exists personas integer not null default 1;

create or replace function public.tg_personas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.personas := public.personas_de((select unidad from public.eventos where id = new.evento_id), new.datos);
  return new;
end;
$$;
revoke all on function public.tg_personas() from public, anon, authenticated;
drop trigger if exists a_personas on public.inscripciones;
create trigger a_personas before insert or update of datos on public.inscripciones
  for each row execute function public.tg_personas();

-- Inscripciones ya cargadas (solo las que no tienen el número correcto, para no tocar las demás).
update public.inscripciones i set personas = public.personas_de(e.unidad, i.datos)
  from public.eventos e
 where e.id = i.evento_id and i.personas is distinct from public.personas_de(e.unidad, i.datos);

-- ---------------------------------------------------------------------
-- Claves para detectar inscripciones repetidas: los DNI (de la persona o de cada integrante);
-- si no hay ningún DNI, el teléfono.
-- ---------------------------------------------------------------------
create or replace function public.claves_inscripcion(p_datos jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  with dnis as (
    select nullif(regexp_replace(coalesce(p_datos ->> 'dni', ''), '\D', '', 'g'), '') as k
    union all
    select nullif(regexp_replace(coalesce(x ->> 'dni', ''), '\D', '', 'g'), '')
      from jsonb_array_elements(case when jsonb_typeof(p_datos -> 'integrantes') = 'array' then p_datos -> 'integrantes' else '[]'::jsonb end) x
  )
  select coalesce(
    (select array_agg(distinct k) from dnis where k is not null),
    (select array_agg(t) from (select nullif(regexp_replace(coalesce(p_datos ->> 'telefono', ''), '\D', '', 'g'), '') as t) y where t is not null),
    '{}'::text[]);
$$;
revoke execute on function public.claves_inscripcion(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Lo que corresponde cobrar por una inscripción (igual que src/logica/precios.js).
--  · persona y pareja: como siempre (calcular_monto).
--  · grupo, «un precio por grupo»: con las respuestas del grupo, sin categorías.
--  · grupo, «según cada integrante»: la suma de lo de cada integrante (respuestas del grupo + las suyas).
-- null = no se puede calcular.
-- ---------------------------------------------------------------------
create or replace function public.calcular_monto_inscripcion(d jsonb, p_categoria text, p_datos jsonb, p_dia date)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_grupo jsonb := coalesce(p_datos, '{}'::jsonb) - 'integrantes';
  x jsonb;
  m integer;
  total integer := 0;
begin
  if coalesce(d ->> 'unidad', '') <> 'grupo' then
    return public.calcular_monto(d, p_categoria, p_datos, p_dia);
  end if;
  if coalesce(d -> 'grupo' ->> 'cobro', 'grupo') = 'integrante' then
    if coalesce(jsonb_typeof(p_datos -> 'integrantes'), '') <> 'array' or jsonb_array_length(p_datos -> 'integrantes') = 0 then return null; end if;
    for x in select * from jsonb_array_elements(p_datos -> 'integrantes') loop
      m := public.calcular_monto(d, nullif(x ->> 'categoria', ''), v_grupo || (x - 'id' - 'responsable' - 'categoria'), p_dia);
      if m is null then return null; end if;
      total := total + m;
    end loop;
    return total;
  end if;
  return public.calcular_monto(d || jsonb_build_object('categorias', '[]'::jsonb), null, v_grupo, p_dia);
end;
$$;
revoke execute on function public.calcular_monto_inscripcion(jsonb, text, jsonb, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Control de la definición del evento (versión de 015 + grupos)
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
  v_ids_grupo text[] := '{}';
  v_cats text[] := '{}';
  v_es_grupo boolean;
begin
  if d is null or coalesce(jsonb_typeof(d), '') <> 'object' then return 'sin definición'; end if;
  if length(d::text) > 100000 then return 'definición demasiado grande'; end if;
  if length(trim(coalesce(d ->> 'nombre', ''))) not between 3 and 120 then return 'nombre'; end if;
  if coalesce(d ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'fecha'; end if;
  if coalesce(d ->> 'unidad', '') not in ('persona', 'pareja', 'grupo') then return 'unidad'; end if;
  v_es_grupo := d ->> 'unidad' = 'grupo';

  if coalesce(jsonb_typeof(d -> 'categorias'), '') <> 'array' then return 'categorias'; end if;
  for c in select * from jsonb_array_elements(d -> 'categorias') loop
    if coalesce(c ->> 'id', '') !~ '^[a-z][a-z0-9_]{0,39}$' or c ->> 'id' = any(v_cats)
       or length(trim(coalesce(c ->> 'nombre', ''))) < 2 then return 'categoría'; end if;
    v_cats := v_cats || (c ->> 'id');
  end loop;
  if cardinality(v_cats) = 1 then return 'una sola categoría'; end if;
  if exists (
    select 1
    from jsonb_array_elements(d -> 'categorias') a, jsonb_array_elements(d -> 'categorias') b
    where a ->> 'id' < b ->> 'id'
      and jsonb_typeof(a -> 'edadMin') = 'number' and jsonb_typeof(a -> 'edadMax') = 'number'
      and jsonb_typeof(b -> 'edadMin') = 'number' and jsonb_typeof(b -> 'edadMax') = 'number'
      and (a ->> 'edadMin')::numeric <= (b ->> 'edadMax')::numeric
      and (b ->> 'edadMin')::numeric <= (a ->> 'edadMax')::numeric
  ) then return 'edades de categorías superpuestas'; end if;

  if coalesce(jsonb_typeof(d -> 'campos'), '') <> 'array' or jsonb_array_length(d -> 'campos') not between 1 and 60 then return 'campos'; end if;
  for c in select * from jsonb_array_elements(d -> 'campos') loop
    if coalesce(c ->> 'id', '') !~ '^[a-z][a-z0-9_]{0,39}$' or c ->> 'id' = any(v_ids)
       or c ->> 'id' in ('categoria', 'integrantes', 'id', 'responsable') then return 'campo ' || coalesce(c ->> 'id', '?'); end if;
    if length(trim(coalesce(c ->> 'etiqueta', ''))) < 2 then return 'campo sin texto'; end if;
    if coalesce(c ->> 'tipo', '') not in ('texto', 'dni', 'telefono', 'numero', 'si_no', 'opcion') then return 'tipo de campo'; end if;
    if c ->> 'tipo' = 'opcion' and (coalesce(jsonb_typeof(c -> 'opciones'), '') <> 'array' or jsonb_array_length(c -> 'opciones') < 2) then return 'opciones'; end if;
    if coalesce((c ->> 'porIntegrante')::boolean, false) and not v_es_grupo then return 'pregunta por integrante fuera de un grupo'; end if;
    if not coalesce((c ->> 'porIntegrante')::boolean, false) then v_ids_grupo := v_ids_grupo || (c ->> 'id'); end if;
    v_ids := v_ids || (c ->> 'id');
  end loop;
  if d ->> 'unidad' = 'persona' and not ('nombre' = any(v_ids)) then return 'falta el nombre'; end if;
  if d ->> 'unidad' = 'pareja' and not ('hombre' = any(v_ids) and 'mujer' = any(v_ids)) then return 'faltan los nombres de la pareja'; end if;
  if 'nombre_grupo' = any(v_ids) and not v_es_grupo then return 'nombre del grupo fuera de un grupo'; end if;

  -- Grupos (R19, D61)
  if v_es_grupo then
    if coalesce(jsonb_typeof(d -> 'grupo'), '') <> 'object' then return 'datos del grupo'; end if;
    if length(trim(coalesce(d -> 'grupo' ->> 'nombre', ''))) not between 2 and 30 then return 'nombre del tipo de grupo'; end if;
    if coalesce(jsonb_typeof(d -> 'grupo' -> 'min'), '') <> 'number' or coalesce(jsonb_typeof(d -> 'grupo' -> 'max'), '') <> 'number'
       or (d -> 'grupo' ->> 'min')::numeric <> trunc((d -> 'grupo' ->> 'min')::numeric)
       or (d -> 'grupo' ->> 'max')::numeric <> trunc((d -> 'grupo' ->> 'max')::numeric)
       or (d -> 'grupo' ->> 'min')::numeric < 2 or (d -> 'grupo' ->> 'max')::numeric > 50
       or (d -> 'grupo' ->> 'min')::numeric > (d -> 'grupo' ->> 'max')::numeric then return 'integrantes del grupo'; end if;
    if coalesce(d -> 'grupo' ->> 'cobro', '') not in ('grupo', 'integrante') then return 'forma de cobro del grupo'; end if;
    if not ('nombre_grupo' = any(v_ids_grupo)) then return 'falta el nombre del grupo'; end if;
    if not exists (select 1 from jsonb_array_elements(d -> 'campos') x where x ->> 'id' = 'nombre' and coalesce((x ->> 'porIntegrante')::boolean, false))
      then return 'falta el nombre de cada integrante'; end if;
    if 'hombre' = any(v_ids) or 'mujer' = any(v_ids) then return 'nombres de pareja en un grupo'; end if;
    if exists (select 1 from jsonb_array_elements(d -> 'campos') x where x ->> 'id' = 'modalidad' and coalesce((x ->> 'porIntegrante')::boolean, false))
      then return 'pregunta de modalidad'; end if;
    -- Una pregunta «por integrante» no puede depender de otra que solo se responde en otro integrante: siempre se ven las del grupo y las propias.
    if d -> 'grupo' ->> 'cobro' = 'grupo' then
      -- Con un precio por grupo, el precio no depende de los integrantes: ni por categoría ni por sus respuestas.
      if exists (select 1 from jsonb_array_elements(coalesce(d -> 'conceptos', '[]'::jsonb)) k2, jsonb_array_elements(k2 -> 'precios') t2 where t2 ? 'porCategoria')
        then return 'precio por categoría con cobro por grupo'; end if;
      if exists (select 1 from jsonb_array_elements(coalesce(d -> 'conceptos', '[]'::jsonb)) k2
                 where jsonb_typeof(k2 -> 'aplicaSi') = 'object' and coalesce(k2 -> 'aplicaSi' ->> 'campo', '') <> ''
                   and not (k2 -> 'aplicaSi' ->> 'campo' = any(v_ids_grupo)))
        then return 'cobro por grupo que depende de un integrante'; end if;
    end if;
  end if;

  -- Modalidad (R18): presencial (por defecto), virtual o híbrido.
  if coalesce(d ->> 'modalidad', 'presencial') not in ('presencial', 'virtual', 'hibrido') then return 'modalidad'; end if;
  if d ->> 'modalidad' = 'hibrido' then
    select x into m from jsonb_array_elements(d -> 'campos') x where x ->> 'id' = 'modalidad';
    if m is null or m ->> 'tipo' <> 'opcion' or not coalesce((m ->> 'obligatorio')::boolean, false)
       or (select array_agg(o ->> 'valor' order by o ->> 'valor') from jsonb_array_elements(m -> 'opciones') o) <> array['presencial', 'virtual']
      then return 'pregunta de modalidad'; end if;
    if d ? 'cupoPresencial' and coalesce(jsonb_typeof(d -> 'cupoPresencial'), '') <> 'null'
       and (coalesce(jsonb_typeof(d -> 'cupoPresencial'), '') <> 'number' or (d ->> 'cupoPresencial')::numeric not between 1 and 1000000
            or (d ->> 'cupoPresencial')::numeric <> trunc((d ->> 'cupoPresencial')::numeric)) then return 'cupo presencial'; end if;
    if d ? 'cierrePresencialPct' and coalesce(jsonb_typeof(d -> 'cierrePresencialPct'), '') <> 'null'
       and coalesce(d ->> 'cierrePresencialPct', '') not in ('90', '95', '100') then return 'cierre del cupo'; end if;
  elsif 'modalidad' = any(v_ids) then return 'pregunta de modalidad';
  end if;
  if d ->> 'modalidad' = 'virtual' and coalesce((d -> 'asistencia' ->> 'toma')::boolean, false) then return 'asistencia en evento virtual'; end if;

  if coalesce(jsonb_typeof(d -> 'conceptos'), '') <> 'array' then return 'conceptos'; end if;
  if coalesce((d ->> 'sinCobro')::boolean, false) then
    if jsonb_array_length(d -> 'conceptos') > 0 then return 'evento sin cobro con conceptos'; end if;
  elsif jsonb_array_length(d -> 'conceptos') < 1 then return 'conceptos'; end if;
  for k in select * from jsonb_array_elements(d -> 'conceptos') loop
    if length(trim(coalesce(k ->> 'nombre', ''))) < 2 then return 'concepto sin nombre'; end if;
    if coalesce(jsonb_typeof(k -> 'precios'), '') <> 'array' or jsonb_array_length(k -> 'precios') not between 1 and 2 then return 'precios'; end if;
    for t in select * from jsonb_array_elements(k -> 'precios') loop
      if t ? 'porCategoria' then
        for m in select value from jsonb_each(t -> 'porCategoria') loop
          if coalesce(jsonb_typeof(m), '') <> 'number' or (m #>> '{}')::numeric < 0 or (m #>> '{}')::numeric <> trunc((m #>> '{}')::numeric) then return 'precio'; end if;
        end loop;
      elsif coalesce(jsonb_typeof(t -> 'monto'), '') <> 'number' or (t ->> 'monto')::numeric < 0 or (t ->> 'monto')::numeric <> trunc((t ->> 'monto')::numeric) then
        return 'precio';
      end if;
    end loop;
  end loop;

  if coalesce((d -> 'asistencia' ->> 'toma')::boolean, false) then
    if coalesce(jsonb_typeof(d -> 'asistencia' -> 'instancias'), '') <> 'array'
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

-- Guardar el borrador del asistente (versión de 009 con la unidad «grupo»).
create or replace function public.panel_guardar_borrador(p_id text, p_borrador jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
  v_nombre text;
  v_fecha date;
  v_unidad text;
  v_id text;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if p_borrador is null or coalesce(jsonb_typeof(p_borrador), '') <> 'object' or length(p_borrador::text) > 100000 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  v_nombre := coalesce(nullif(trim(coalesce(p_borrador ->> 'nombre', '')), ''), 'Evento sin nombre');
  begin
    v_fecha := nullif(p_borrador ->> 'fecha', '')::date;
  exception when others then v_fecha := null;
  end;
  v_unidad := case when p_borrador ->> 'unidad' in ('pareja', 'grupo') then p_borrador ->> 'unidad' else 'persona' end;

  if p_id is null or p_id = '' then
    v_id := public.nuevo_id_evento(v_nombre, v_fecha);
    insert into public.eventos (id, nombre, fecha, unidad, estado, es_modelo, definicion, creado_por, actualizado_en)
    values (v_id, left(v_nombre, 120), coalesce(v_fecha, current_date), v_unidad, 'borrador', false, p_borrador, public.correo_actual(), now());
    perform public.auditar('crear_borrador', 'evento', v_id, null, jsonb_build_object('nombre', v_nombre));
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_ev from public.eventos where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if v_ev.estado <> 'borrador' then return jsonb_build_object('ok', false, 'error', 'evento_ya_abierto'); end if;
  update public.eventos
     set nombre = left(v_nombre, 120), fecha = coalesce(v_fecha, fecha), unidad = v_unidad,
         definicion = p_borrador, actualizado_en = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;
revoke all on function public.panel_guardar_borrador(text, jsonb) from public;
grant execute on function public.panel_guardar_borrador(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Asistencia: «todos juntos» o «cada persona por separado», también en los grupos.
-- ---------------------------------------------------------------------
create or replace function public.config_asistencia(p_evento text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(e.definicion -> 'asistencia', '{}'::jsonb)
    || jsonb_build_object(
      'toma', coalesce((e.definicion -> 'asistencia' ->> 'toma')::boolean, true),
      'unidad', e.unidad,
      'modoPareja', case when e.unidad in ('pareja', 'grupo') then coalesce(e.definicion -> 'asistencia' ->> 'modoPareja', 'pareja') end,
      'instancias', coalesce(nullif(e.definicion -> 'asistencia' -> 'instancias', '[]'::jsonb),
                             jsonb_build_array(jsonb_build_object('id', 'llegada', 'nombre', 'Llegada', 'fecha', e.fecha))))
  from public.eventos e where e.id = p_evento;
$$;
revoke all on function public.config_asistencia(text) from public, anon, authenticated;

create or replace function public._marcar(p_id uuid, p_evento text, p_inscripcion uuid, p_instancia text, p_persona text,
                                         p_marcada_en timestamptz, p_por text, p_sesion uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg jsonb := public.config_asistencia(p_evento);
  v_existente public.asistencias;
  v_persona text := coalesce(p_persona, '');
  v_ins public.inscripciones;
begin
  select * into v_ins from public.inscripciones where id = p_inscripcion and evento_id = p_evento and estado <> 'anulada';
  if not found then return 'inscripcion_invalida'; end if;
  if not exists (select 1 from jsonb_array_elements(v_cfg -> 'instancias') i where i ->> 'id' = p_instancia) then
    return 'instancia_invalida';
  end if;
  if v_cfg ->> 'modoPareja' = 'individual' then
    if v_cfg ->> 'unidad' = 'grupo' then
      if not exists (select 1 from jsonb_array_elements(coalesce(v_ins.datos -> 'integrantes', '[]'::jsonb)) x where x ->> 'id' = v_persona) then
        return 'datos_invalidos';
      end if;
    elsif v_persona not in ('hombre', 'mujer') then return 'datos_invalidos';
    end if;
  else
    v_persona := '';
  end if;

  if exists (select 1 from public.asistencias where id = p_id) then return 'repetida'; end if;

  select * into v_existente from public.asistencias
   where inscripcion_id = p_inscripcion and instancia = p_instancia and persona = v_persona and estado = 'presente';
  if found then
    if p_marcada_en < v_existente.marcada_en then
      update public.asistencias set estado = 'deshecha' where id = v_existente.id;
      insert into public.asistencias (id, evento_id, inscripcion_id, instancia, persona, marcada_en, marcado_por, sesion_id)
      values (p_id, p_evento, p_inscripcion, p_instancia, v_persona, p_marcada_en, p_por, p_sesion);
    end if;
    return 'ya_presente';
  end if;
  begin
    insert into public.asistencias (id, evento_id, inscripcion_id, instancia, persona, marcada_en, marcado_por, sesion_id)
    values (p_id, p_evento, p_inscripcion, p_instancia, v_persona, p_marcada_en, p_por, p_sesion);
  exception when unique_violation then
    return 'ya_presente';
  end;
  return 'ok';
end;
$$;
revoke all on function public._marcar(uuid, text, uuid, text, text, timestamptz, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Recepción de una inscripción (versión de 012 + grupos)
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
  v_claves  text[];
  v_dup     uuid;
  v_creada  timestamptz;
  v_fuera   boolean;
  margen    constant interval := interval '10 minutes';
  v_esperado integer;
begin
  if p is null or length(p::text) > 60000 then
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

  -- Grupos: la lista de integrantes tiene que existir (entre 1 y 50, cada uno con su id).
  if v_ev.unidad = 'grupo' then
    if coalesce(jsonb_typeof(p -> 'datos' -> 'integrantes'), '') <> 'array'
       or jsonb_array_length(p -> 'datos' -> 'integrantes') not between 1 and 50
       or exists (select 1 from jsonb_array_elements(p -> 'datos' -> 'integrantes') x
                  where coalesce(jsonb_typeof(x), '') <> 'object' or coalesce(x ->> 'id', '') !~ '^i[0-9]{1,3}$')
       or (select count(distinct x ->> 'id') from jsonb_array_elements(p -> 'datos' -> 'integrantes') x) <> jsonb_array_length(p -> 'datos' -> 'integrantes') then
      return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
    end if;
  end if;

  -- D51: el servidor vuelve a calcular el monto. Si no coincide, se guarda IGUAL, marcada para revisar.
  begin
    v_esperado := public.calcular_monto_inscripcion(v_ev.definicion || jsonb_build_object('unidad', v_ev.unidad),
                    nullif(p->>'categoria', ''), coalesce(p->'datos', '{}'::jsonb), (p->>'diaCarga')::date);
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
          or v_creada > v_ev.inscripciones_cerradas_en + margen;
  v_fuera := coalesce(v_fuera, false);

  -- Repetidas: algún DNI (de la persona o de cualquier integrante) ya inscripto; sin DNI, el teléfono.
  v_claves := public.claves_inscripcion(coalesce(p->'datos', '{}'::jsonb));
  if cardinality(v_claves) > 0 then
    select i.id into v_dup
    from public.inscripciones i
    where i.evento_id = v_ev.id
      and i.estado <> 'anulada'
      and public.claves_inscripcion(i.datos) && v_claves
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
      case when v_ev.unidad = 'grupo' then null else nullif(p->>'categoria', '') end,
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

-- «Ya está presente» al inscribir (D31). Si el evento marca a cada persona por separado,
-- se marca a todas las personas de la inscripción (los dos de la pareja o cada integrante).
create or replace function public.enviar_inscripcion_y_presente(p_token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := public.enviar_inscripcion(p_token, p - 'presente');
  v_ses uuid;
  v_acc public.accesos;
  v_nombre text;
  v_cfg jsonb;
  v_personas text[];
  v_per text;
  v_base uuid;
begin
  if (r ->> 'ok')::boolean and p ? 'presente' and jsonb_typeof(p -> 'presente') = 'object' then
    v_ses := public.sesion_de_token(p_token);
    select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
    select nombre into v_nombre from public.colaboradores where id = v_acc.colaborador_id;
    v_cfg := public.config_asistencia(v_acc.evento_id);
    begin
      v_base := (p -> 'presente' ->> 'id')::uuid;
      if v_cfg ->> 'modoPareja' = 'individual' then
        if v_cfg ->> 'unidad' = 'grupo' then
          select array_agg(x ->> 'id') into v_personas
            from public.inscripciones i, jsonb_array_elements(i.datos -> 'integrantes') x where i.id = (p ->> 'id')::uuid;
        else
          v_personas := array['hombre', 'mujer'];
        end if;
        foreach v_per in array coalesce(v_personas, '{}'::text[]) loop
          perform public._marcar(md5(v_base::text || v_per)::uuid, v_acc.evento_id, (p ->> 'id')::uuid,
                                 p -> 'presente' ->> 'instancia', v_per, (p ->> 'creadaEn')::timestamptz, v_nombre, v_ses);
        end loop;
      else
        perform public._marcar(v_base, v_acc.evento_id, (p ->> 'id')::uuid,
                               p -> 'presente' ->> 'instancia', '', (p ->> 'creadaEn')::timestamptz, v_nombre, v_ses);
      end if;
    exception when others then
      null; -- la inscripción ya quedó guardada; la marca se puede hacer en la puerta
    end;
  end if;
  return r;
end;
$$;
revoke all on function public.enviar_inscripcion_y_presente(text, jsonb) from public;
grant execute on function public.enviar_inscripcion_y_presente(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Cupo presencial: cuenta personas (columna «personas»).
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
  select coalesce(sum(personas) filter (where coalesce(datos ->> 'modalidad', 'presencial') <> 'virtual'), 0),
         coalesce(sum(personas) filter (where datos ->> 'modalidad' = 'virtual'), 0)
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

-- ---------------------------------------------------------------------
-- Panel: resumen (versión de 017 con personas y categorías de los integrantes)
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
  cats as (
    -- Una fila por persona con categoría: la de la inscripción o, en los grupos, la de cada integrante.
    select coalesce(categoria, '') as categoria from ins where jsonb_typeof(datos -> 'integrantes') is distinct from 'array'
    union all
    select coalesce(x ->> 'categoria', '') from ins, jsonb_array_elements(datos -> 'integrantes') x where jsonb_typeof(datos -> 'integrantes') = 'array'
  ),
  cargadores as (
    select cargador from ins
    union select cargador from public.rendiciones where evento_id = p_evento and not anulada
  ),
  por_cargador as (
    select c.cargador,
      (select count(*) from ins i where i.cargador = c.cargador) as inscripciones,
      (select coalesce(sum(personas), 0) from ins i where i.cargador = c.cargador) as personas,
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
    'personas', (select coalesce(sum(personas), 0) from ins),
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
        'cargador', cargador, 'inscripciones', inscripciones, 'personas', personas, 'total', total, 'efectivo', efectivo,
        'terminal', terminal, 'transferencia', transferencia, 'rendido', rendido,
        'aRendir', efectivo - rendido, 'ultimaConexion', ultima_conexion,
        'ticketsTerminal', tickets_terminal, 'ticketsRendidos', tickets_rendidos, 'ticketsPendientes', tickets_terminal - tickets_rendidos
      ) order by cargador) from por_cargador), '[]'::jsonb),
    'porCategoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria, 'cantidad', n) order by categoria)
        from (select categoria, count(*) as n from cats group by 1) x), '[]'::jsonb),
    'porDia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia_carga, 'cantidad', n, 'personas', p) order by dia_carga)
        from (select dia_carga, count(*) as n, sum(personas) as p from ins group by 1) x), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;
revoke all on function public.panel_resumen(text) from public;
grant execute on function public.panel_resumen(text) to authenticated;

-- Panel: presentes (versión de 015). Con «cada persona por separado» se esperan todas las personas.
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
    'esperados', (select case when v_por_persona then coalesce(sum(i.personas), 0) else count(*) end
                  from public.inscripciones i where i.evento_id = p_evento and i.estado <> 'anulada' and coalesce(i.datos ->> 'modalidad', 'presencial') <> 'virtual'),
    'porInstancia', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', inst ->> 'id', 'nombre', inst ->> 'nombre', 'fecha', inst ->> 'fecha',
        'presentes', (select count(*) from public.asistencias a join public.inscripciones i on i.id = a.inscripcion_id
                       where a.evento_id = p_evento and a.instancia = inst ->> 'id' and a.estado = 'presente' and i.estado <> 'anulada'),
        'porCategoria', coalesce((select jsonb_object_agg(coalesce(cat, ''), n) from (
            select coalesce(i.categoria, (select x ->> 'categoria' from jsonb_array_elements(case when jsonb_typeof(i.datos -> 'integrantes') = 'array' then i.datos -> 'integrantes' else '[]'::jsonb end) x where x ->> 'id' = a.persona)) as cat,
                   count(*) as n
            from public.asistencias a join public.inscripciones i on i.id = a.inscripcion_id
            where a.evento_id = p_evento and a.instancia = inst ->> 'id' and a.estado = 'presente' and i.estado <> 'anulada'
            group by 1) x), '{}'::jsonb),
        'ausentes', coalesce((select jsonb_agg(jsonb_build_object('n', i.numero_orden,
              'nombre', coalesce(i.datos ->> 'nombre', i.datos ->> 'nombre_grupo', concat_ws(' y ', i.datos ->> 'hombre', i.datos ->> 'mujer')),
              'categoria', i.categoria, 'telefono', i.datos ->> 'telefono', 'personas', i.personas) order by i.numero_orden)
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

-- Puerta: la lista del celular (versión de 015). En los grupos trae, de cada integrante, solo lo necesario
-- para reconocerlo: su id, nombre, DNI y categoría.
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
  v_busq := coalesce((select array_agg(x) from jsonb_array_elements_text(v_cfg -> 'camposBusqueda') x), array['nombre', 'dni', 'hombre', 'mujer'])
            || array['nombre_grupo'];
  v_proc := v_cfg ->> 'campoProcedencia';

  return jsonb_build_object(
    'ok', true,
    'ahora', now(),
    'asistencia', v_cfg,
    'inscripciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'n', i.numero_orden,
        'datos', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each_text(i.datos - 'integrantes') as t(k, v) where k = any(v_busq)),
        'categoria', i.categoria,
        'procedencia', case when v_proc is not null then i.datos ->> v_proc end,
        'anulada', i.estado = 'anulada',
        'virtual', i.datos ->> 'modalidad' = 'virtual',
        'personas', i.personas)
        || case when jsonb_typeof(i.datos -> 'integrantes') = 'array' then jsonb_build_object('integrantes', (
             select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', x ->> 'id', 'nombre', x ->> 'nombre', 'dni', x ->> 'dni',
                                                          'categoria', x ->> 'categoria', 'responsable', (x ->> 'responsable')::boolean))), '[]'::jsonb)
               from jsonb_array_elements(i.datos -> 'integrantes') x)) else '{}'::jsonb end)
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

-- ---------------------------------------------------------------------
-- Corrección de una inscripción (versión de 010 + grupos, D61 alternativa A)
--  · En los grupos se puede reemplazar a un integrante siempre; agregar o quitar integrantes, dentro del
--    mínimo y el máximo, solo si el monto no cambia. Si cambia: se anula y se carga de nuevo (D40).
-- ---------------------------------------------------------------------
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
  v_ev public.eventos;
  v_ult text := upper(regexp_replace(coalesce(p_ultimos6, ''), '[^A-Za-z0-9]', '', 'g'));
  v_datos jsonb;
  v_def jsonb;
  v_n integer;
  v_antes integer;
  v_despues integer;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'falta_motivo'); end if;
  select * into v_ins from public.inscripciones where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_encontrada'); end if;
  if v_ins.estado = 'anulada' then return jsonb_build_object('ok', false, 'error', 'anulada'); end if;
  select * into v_ev from public.eventos where id = v_ins.evento_id;
  v_def := v_ev.definicion || jsonb_build_object('unidad', v_ev.unidad);
  if v_ins.medio_pago = 'sin_cobro' then p_medio := 'sin_cobro';
  elsif p_medio not in ('efectivo', 'terminal', 'transferencia') then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;
  if p_medio = 'transferencia' and (coalesce(trim(p_banco), '') = '' or v_ult !~ '^[A-Z0-9]{6}$') then
    return jsonb_build_object('ok', false, 'error', 'transferencia_incompleta');
  end if;
  if p_datos is null or coalesce(jsonb_typeof(p_datos), '') <> 'object' or length(p_datos::text) > 60000 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  -- Solo se cambian campos que ya existen en la inscripción o en el formulario del evento.
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_datos
  from jsonb_each(v_ins.datos || p_datos) as t(k, v)
  where v_ins.datos ? k
     or exists (select 1 from jsonb_array_elements(v_ev.definicion -> 'campos') c where c ->> 'id' = k);

  if v_ev.unidad = 'grupo' then
    if coalesce(jsonb_typeof(v_datos -> 'integrantes'), '') <> 'array'
       or exists (select 1 from jsonb_array_elements(v_datos -> 'integrantes') x
                  where coalesce(jsonb_typeof(x), '') <> 'object' or coalesce(x ->> 'id', '') !~ '^i[0-9]{1,3}$' or length(trim(coalesce(x ->> 'nombre', ''))) < 2)
       or (select count(distinct x ->> 'id') from jsonb_array_elements(v_datos -> 'integrantes') x) <> jsonb_array_length(v_datos -> 'integrantes') then
      return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
    end if;
    v_n := jsonb_array_length(v_datos -> 'integrantes');
    if v_n < (v_ev.definicion -> 'grupo' ->> 'min')::integer or v_n > (v_ev.definicion -> 'grupo' ->> 'max')::integer then
      return jsonb_build_object('ok', false, 'error', 'integrantes_fuera_de_rango',
        'min', (v_ev.definicion -> 'grupo' ->> 'min')::integer, 'max', (v_ev.definicion -> 'grupo' ->> 'max')::integer);
    end if;
    if (select count(*) from jsonb_array_elements(v_datos -> 'integrantes') x where coalesce((x ->> 'responsable')::boolean, false)) <> 1 then
      return jsonb_build_object('ok', false, 'error', 'falta_responsable');
    end if;
  end if;

  -- Grupos: el monto no se corrige (D40). Si con los integrantes nuevos correspondería otro monto, no se acepta el cambio.
  begin
    v_antes := public.calcular_monto_inscripcion(v_def, v_ins.categoria, v_ins.datos, v_ins.dia_carga);
    v_despues := public.calcular_monto_inscripcion(v_def, v_ins.categoria, v_datos, v_ins.dia_carga);
  exception when others then v_antes := null; v_despues := null;
  end;
  if v_ev.unidad = 'grupo' and v_antes is distinct from v_despues and v_ins.medio_pago <> 'sin_cobro' then
    return jsonb_build_object('ok', false, 'error', 'cambia_el_monto', 'antes', v_antes, 'despues', v_despues);
  end if;

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

-- Todos los valores de una inscripción en un texto (también los de cada integrante), para buscar.
create or replace function public.texto_inscripcion(p_datos jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(string_agg(v #>> '{}', ' '), '')
    from jsonb_path_query(coalesce(p_datos, '{}'::jsonb), 'strict $.**') v
   where jsonb_typeof(v) in ('string', 'number');
$$;
revoke execute on function public.texto_inscripcion(jsonb) from public, anon, authenticated;

-- Panel: lista de inscripciones (versión de 015 + personas).
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
        'personas', i.personas,
        'duplicadoDe', (select d.numero_orden from public.inscripciones d where d.id = i.duplicado_de)
      ) as x
      from public.inscripciones i
      where i.evento_id = p_evento
        and (p_filtro <> 'revisar' or ((i.estado = 'posible_duplicado' or i.fuera_de_horario or i.monto_revisar or i.sobre_cupo) and i.estado <> 'anulada'))
        and (p_filtro <> 'anuladas' or i.estado = 'anulada')
        and (b = ''
             or translate(lower(public.texto_inscripcion(i.datos)), 'áéíóúüñ', 'aeiouun') like '%' || b || '%'
             or (length(bnum) >= 3 and regexp_replace(public.texto_inscripcion(i.datos), '\D', '', 'g') like '%' || bnum || '%')
             or i.numero_orden::text = bnum)
      order by i.numero_orden desc
      limit greatest(1, least(coalesce(p_limite, 200), 1000))
    ) t), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_inscripciones(text, text, text, integer) from public;
grant execute on function public.panel_inscripciones(text, text, text, integer) to authenticated;

-- Panel: lista de eventos (versión de 015 + datos del grupo).
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
      'grupo', e.definicion -> 'grupo',
      'practica', e.practica,
      'modalidad', coalesce(e.definicion ->> 'modalidad', 'presencial'),
      'cupoPresencial', coalesce(e.cupo_presencial, (e.definicion ->> 'cupoPresencial')::integer),
      'cierrePresencialPct', case when e.cierre_presencial_pct = 0 then null else coalesce(e.cierre_presencial_pct, (e.definicion ->> 'cierrePresencialPct')::integer) end,
      'presencialesCerradasEn', e.presenciales_cerradas_en, 'presencialesCerradasPor', e.presenciales_cerradas_por,
      'categorias', coalesce(e.definicion -> 'categorias', '[]'::jsonb),
      'campos', coalesce(e.definicion -> 'campos', '[]'::jsonb),
      'conceptos', coalesce(e.definicion -> 'conceptos', '[]'::jsonb),
      'sinCobro', jsonb_array_length(coalesce(e.definicion -> 'conceptos', '[]'::jsonb)) = 0,
      'inscripcionesCerradasEn', e.inscripciones_cerradas_en, 'inscripcionesCerradasPor', e.inscripciones_cerradas_por
    ) order by e.practica, e.fecha desc)
    from public.eventos e where e.estado <> 'borrador'), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_eventos() from public, anon;
grant execute on function public.panel_eventos() to authenticated;

create or replace function public.version_base()
returns integer
language sql
immutable
as $$ select 18 $$;
revoke all on function public.version_base() from public, anon, authenticated;

select 'Inscripción por grupo instalada' as resultado, public.version_base() as version;
