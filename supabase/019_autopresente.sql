-- =====================================================================
-- Autopresente con QR (R20, D62)
--  · En los eventos que lo tienen activado (definicion -> 'asistencia' ->> 'autopresente' = true), además del
--    control en la puerta, el Organizador genera un QR para que cada participante marque su propio presente.
--  · Dos formas (las elige el Organizador al crearlo):
--      'impreso'  = cartel impreso; el QR vale solo en el horario elegido (lo más simple).
--      'pantalla' = QR en una pantalla con internet (celular, tablet o TV) que cambia cada 30 segundos:
--                   una foto vieja ya no sirve (más seguro: eventos pagos o con certificado).
--  · El participante escanea, escribe su DNI o su teléfono (coincidencia EXACTA), ve solo su nombre
--    parcialmente oculto («Juan P.») y confirma. Nunca ve la lista ni datos de otros.
--  · Límite de intentos: 8 búsquedas sin resultado por celular cada 15 minutos (y 300 por QR cada 15 minutos),
--    para que nadie pueda recorrer la lista probando números.
--  · Las marcas quedan como «Se anotó solo» (origen 'autopresente') en el panel, la puerta y el Excel.
-- Se ejecuta después de 001 a 018. Se puede volver a ejecutar sin problemas.
-- =====================================================================

create table if not exists public.autopresentes (
  id          uuid primary key default gen_random_uuid(),
  evento_id   text not null references public.eventos (id) on delete cascade,
  instancia   text not null check (length(instancia) between 1 and 60),
  modo        text not null check (modo in ('impreso', 'pantalla')),
  codigo      text not null unique check (codigo ~ '^[a-z0-9]{12}$'),        -- va en el QR (público)
  pantalla    text unique check (pantalla is null or pantalla ~ '^[a-f0-9]{48}$'), -- enlace de la pantalla (no se muestra al público)
  secreto     text not null,                                               -- para el QR que cambia
  desde       timestamptz not null,
  hasta       timestamptz not null check (hasta > desde),
  creado_por  text,
  creado_en   timestamptz not null default now(),
  cerrado_en  timestamptz,
  cerrado_por text
);
create index if not exists autopresentes_evento_idx on public.autopresentes (evento_id);
alter table public.autopresentes enable row level security;
revoke all on public.autopresentes from anon, authenticated;

create table if not exists public.autopresente_intentos (
  autopresente_id uuid not null references public.autopresentes (id) on delete cascade,
  dispositivo     text not null,
  en              timestamptz not null default now(),
  encontro        boolean not null
);
create index if not exists autopresente_intentos_idx on public.autopresente_intentos (autopresente_id, en);
alter table public.autopresente_intentos enable row level security;
revoke all on public.autopresente_intentos from anon, authenticated;

alter table public.asistencias add column if not exists origen text not null default 'puerta';
alter table public.asistencias drop constraint if exists asistencias_origen_check;
alter table public.asistencias add constraint asistencias_origen_check check (origen in ('puerta', 'cargador', 'autopresente'));

-- ---------------------------------------------------------------------
-- Código de 30 segundos del QR en pantalla
-- ---------------------------------------------------------------------
create or replace function public.autopresente_ventana(p_ahora timestamptz default now())
returns bigint language sql stable as $$ select floor(extract(epoch from p_ahora) / 30)::bigint $$;
revoke all on function public.autopresente_ventana(timestamptz) from public, anon, authenticated;

create or replace function public.autopresente_codigo_ventana(p_secreto text, p_ventana bigint)
returns text
language sql
immutable
set search_path = public, extensions
as $$ select substr(encode(extensions.hmac(p_ventana::text, p_secreto, 'sha256'), 'hex'), 1, 8) $$;
revoke all on function public.autopresente_codigo_ventana(text, bigint) from public, anon, authenticated;

-- ¿El código escaneado sirve ahora? null = sí; si no, el motivo.
-- Formato: «codigo» (impreso) o «codigo.xxxxxxxx» (pantalla: el de esta ventana de 30 s o el de la anterior).
create or replace function public._autopresente_base(p_codigo text)
returns text language sql immutable as $$ select lower(split_part(trim(coalesce(p_codigo, '')), '.', 1)) $$;
revoke all on function public._autopresente_base(text) from public, anon, authenticated;

create or replace function public._autopresente_motivo(p_codigo text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q public.autopresentes;
  v_rot text := lower(split_part(trim(coalesce(p_codigo, '')), '.', 2));
  w bigint := public.autopresente_ventana();
begin
  select * into q from public.autopresentes where codigo = public._autopresente_base(p_codigo);
  if not found then return 'qr_invalido'; end if;
  if q.cerrado_en is not null then return 'qr_cerrado'; end if;
  if now() < q.desde then return 'qr_todavia_no'; end if;
  if now() > q.hasta then return 'qr_vencido'; end if;
  if q.modo = 'pantalla' and v_rot not in (public.autopresente_codigo_ventana(q.secreto, w), public.autopresente_codigo_ventana(q.secreto, w - 1)) then
    return 'qr_viejo';
  end if;
  return null;
end;
$$;
revoke all on function public._autopresente_motivo(text) from public, anon, authenticated;

-- Nombre parcialmente oculto: la primera palabra completa y la inicial de las demás («Juan P.»).
create or replace function public.nombre_oculto(p text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(
    (select string_agg(case when n = 1 then w else left(w, 1) || '.' end, ' ' order by n)
       from regexp_split_to_table(trim(coalesce(p, '')), '\s+') with ordinality as t(w, n) where w <> '')), ''), '?');
$$;
revoke all on function public.nombre_oculto(text) from public, anon, authenticated;

-- Personas que coinciden EXACTAMENTE con un DNI o un teléfono en el evento (solo inscripciones activas y
-- presenciales). Una fila por opción para marcar: la inscripción entera (modo junto) o cada persona.
create or replace function public._autopresente_opciones(p_evento text, p_dato text)
returns table (inscripcion_id uuid, persona text, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d text := regexp_replace(coalesce(p_dato, ''), '\D', '', 'g');
  v_cfg jsonb := public.config_asistencia(p_evento);
  v_ind boolean := coalesce(v_cfg ->> 'modoPareja' = 'individual', false);
begin
  if length(d) < 6 then return; end if;
  return query
  with ins as (
    select i.* from public.inscripciones i
    where i.evento_id = p_evento and i.estado <> 'anulada' and coalesce(i.datos ->> 'modalidad', 'presencial') <> 'virtual'
  ),
  -- Por DNI de la persona, o del integrante (en los grupos), o por el teléfono de la inscripción.
  integ as (
    select ins.id, x ->> 'id' as pid, x ->> 'nombre' as nom, regexp_replace(coalesce(x ->> 'dni', ''), '\D', '', 'g') as dni
    from ins, jsonb_array_elements(case when jsonb_typeof(ins.datos -> 'integrantes') = 'array' then ins.datos -> 'integrantes' else '[]'::jsonb end) x
  ),
  por_telefono as (select ins.* from ins where regexp_replace(coalesce(ins.datos ->> 'telefono', ''), '\D', '', 'g') = d)
  -- Persona (o pareja/grupo marcado junto) que coincide por DNI propio o teléfono.
  select ins.id, ''::text,
         coalesce(ins.datos ->> 'nombre', ins.datos ->> 'nombre_grupo', concat_ws(' y ', ins.datos ->> 'hombre', ins.datos ->> 'mujer'))
    from ins
   where not v_ind and (regexp_replace(coalesce(ins.datos ->> 'dni', ''), '\D', '', 'g') = d or ins.id in (select id from por_telefono)
                        or ins.id in (select id from integ where dni = d))
  union all
  -- Por separado, en parejas: el teléfono de la pareja ofrece a los dos.
  select p.id, x.per, p.datos ->> x.per
    from por_telefono p, (values ('hombre'), ('mujer')) x(per)
   where v_ind and v_cfg ->> 'unidad' = 'pareja'
  union all
  -- Por separado, en grupos: el DNI de un integrante lo ofrece a él; el teléfono del grupo, a todos.
  select g.id, g.pid, g.nom from integ g
   where v_ind and (g.dni = d or g.id in (select id from por_telefono));
end;
$$;
revoke all on function public._autopresente_opciones(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Página del participante (sin iniciar sesión)
-- ---------------------------------------------------------------------
-- 1) ¿El QR sirve? Muestra el evento y el momento.
create or replace function public.autopresente_estado(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q public.autopresentes;
  v_motivo text := public._autopresente_motivo(p_codigo);
  v_ev public.eventos;
begin
  select * into q from public.autopresentes where codigo = public._autopresente_base(p_codigo);
  if not found then return jsonb_build_object('ok', false, 'error', 'qr_invalido'); end if;
  select * into v_ev from public.eventos where id = q.evento_id;
  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'error', v_motivo, 'evento', v_ev.nombre, 'desde', q.desde, 'hasta', q.hasta);
  end if;
  return jsonb_build_object('ok', true, 'evento', v_ev.nombre, 'practica', v_ev.practica, 'hasta', q.hasta,
    'momento', (select i ->> 'nombre' from jsonb_array_elements(public.config_asistencia(v_ev.id) -> 'instancias') i where i ->> 'id' = q.instancia));
end;
$$;
revoke all on function public.autopresente_estado(text) from public;
grant execute on function public.autopresente_estado(text) to anon, authenticated;

-- 2) Buscar por DNI o teléfono. p_dispositivo: identificador al azar que guarda el celular (para el límite de intentos).
create or replace function public.autopresente_buscar(p_codigo text, p_dato text, p_dispositivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.autopresentes;
  v_motivo text := public._autopresente_motivo(p_codigo);
  v_disp text := left(coalesce(nullif(trim(p_dispositivo), ''), 'sin-id'), 60);
  v_opciones jsonb;
begin
  if v_motivo is not null then return jsonb_build_object('ok', false, 'error', v_motivo); end if;
  select * into q from public.autopresentes where codigo = public._autopresente_base(p_codigo);
  delete from public.autopresente_intentos where en < now() - interval '1 day';
  if (select count(*) from public.autopresente_intentos where autopresente_id = q.id and dispositivo = v_disp and not encontro and en > now() - interval '15 minutes') >= 8
     or (select count(*) from public.autopresente_intentos where autopresente_id = q.id and not encontro and en > now() - interval '15 minutes') >= 300 then
    return jsonb_build_object('ok', false, 'error', 'demasiados_intentos');
  end if;
  if length(regexp_replace(coalesce(p_dato, ''), '\D', '', 'g')) < 6 then return jsonb_build_object('ok', false, 'error', 'dato_corto'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'opcion', o.inscripcion_id::text || '|' || o.persona,
           'nombre', public.nombre_oculto(o.nombre),
           'yaPresente', exists (select 1 from public.asistencias a where a.inscripcion_id = o.inscripcion_id and a.instancia = q.instancia
                                   and a.persona = o.persona and a.estado = 'presente'))
         order by o.persona), '[]'::jsonb)
    into v_opciones
    from (select distinct * from public._autopresente_opciones(q.evento_id, p_dato)) o;
  insert into public.autopresente_intentos (autopresente_id, dispositivo, encontro) values (q.id, v_disp, jsonb_array_length(v_opciones) > 0);
  if jsonb_array_length(v_opciones) = 0 then return jsonb_build_object('ok', false, 'error', 'no_encontrado'); end if;
  return jsonb_build_object('ok', true, 'opciones', v_opciones);
end;
$$;
revoke all on function public.autopresente_buscar(text, text, text) from public;
grant execute on function public.autopresente_buscar(text, text, text) to anon, authenticated;

-- 3) Confirmar: se vuelve a comprobar que el dato coincide con la opción elegida (no se puede marcar a otro).
create or replace function public.autopresente_marcar(p_codigo text, p_dato text, p_opciones text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.autopresentes;
  v_motivo text := public._autopresente_motivo(p_codigo);
  o text;
  v_ins uuid;
  v_per text;
  r text;
  res jsonb := '[]'::jsonb;
begin
  if v_motivo is not null then return jsonb_build_object('ok', false, 'error', v_motivo); end if;
  select * into q from public.autopresentes where codigo = public._autopresente_base(p_codigo);
  if p_opciones is null or cardinality(p_opciones) = 0 or cardinality(p_opciones) > 50 then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;
  foreach o in array p_opciones loop
    begin
      v_ins := split_part(o, '|', 1)::uuid;
      v_per := split_part(o, '|', 2);
    exception when others then return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
    end;
    if not exists (select 1 from public._autopresente_opciones(q.evento_id, p_dato) x where x.inscripcion_id = v_ins and x.persona = v_per) then
      return jsonb_build_object('ok', false, 'error', 'no_encontrado');
    end if;
  end loop;
  foreach o in array p_opciones loop
    v_ins := split_part(o, '|', 1)::uuid;
    v_per := split_part(o, '|', 2);
    r := public._marcar(gen_random_uuid(), q.evento_id, v_ins, q.instancia, v_per, now(), 'Se anotó solo', null);
    update public.asistencias set origen = 'autopresente'
     where inscripcion_id = v_ins and instancia = q.instancia and persona = v_per and estado = 'presente' and marcado_por = 'Se anotó solo';
    res := res || jsonb_build_array(jsonb_build_object('opcion', o, 'resultado', r));
  end loop;
  return jsonb_build_object('ok', true, 'resultados', res, 'hora', now());
end;
$$;
revoke all on function public.autopresente_marcar(text, text, text[]) from public;
grant execute on function public.autopresente_marcar(text, text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Pantalla que muestra el QR que cambia (la abre el Organizador en un celular, tablet o TV con internet)
-- ---------------------------------------------------------------------
create or replace function public.autopresente_pantalla(p_pantalla text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q public.autopresentes;
  w bigint := public.autopresente_ventana();
begin
  select * into q from public.autopresentes where pantalla = lower(coalesce(p_pantalla, ''));
  if not found then return jsonb_build_object('ok', false, 'error', 'qr_invalido'); end if;
  return jsonb_build_object('ok', true, 'ahora', now(),
    'evento', (select nombre from public.eventos where id = q.evento_id),
    'momento', (select i ->> 'nombre' from jsonb_array_elements(public.config_asistencia(q.evento_id) -> 'instancias') i where i ->> 'id' = q.instancia),
    'desde', q.desde, 'hasta', q.hasta, 'cerradoEn', q.cerrado_en,
    'codigo', case when q.cerrado_en is null and now() between q.desde and q.hasta then q.codigo || '.' || public.autopresente_codigo_ventana(q.secreto, w) end,
    'segundos', 30 - (floor(extract(epoch from now()))::bigint % 30));
end;
$$;
revoke all on function public.autopresente_pantalla(text) from public;
grant execute on function public.autopresente_pantalla(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Panel (Organizador): crear, ver y cerrar los QR de autopresente de un evento
-- ---------------------------------------------------------------------
create or replace function public.panel_autopresentes(p_evento text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg jsonb := public.config_asistencia(p_evento);
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if v_cfg is null then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  return jsonb_build_object('ok', true,
    'habilitado', coalesce((v_cfg ->> 'autopresente')::boolean, false) and coalesce((v_cfg ->> 'toma')::boolean, true),
    'instancias', v_cfg -> 'instancias',
    'qrs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'instancia', q.instancia, 'modo', q.modo, 'codigo', q.codigo, 'pantalla', q.pantalla,
        'desde', q.desde, 'hasta', q.hasta, 'cerradoEn', q.cerrado_en,
        'marcas', (select count(*) from public.asistencias a where a.evento_id = q.evento_id and a.instancia = q.instancia
                     and a.origen = 'autopresente' and a.estado = 'presente' and a.marcada_en between q.desde and coalesce(q.cerrado_en, q.hasta)))
        order by q.creado_en desc) from public.autopresentes q where q.evento_id = p_evento), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_autopresentes(text) from public, anon;
grant execute on function public.panel_autopresentes(text) to authenticated;

create or replace function public.panel_crear_autopresente(p_evento text, p_instancia text, p_modo text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cfg jsonb := public.config_asistencia(p_evento);
  v_codigo text;
  v_id uuid;
  v_pantalla text;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  if v_cfg is null or not exists (select 1 from public.eventos where id = p_evento and estado <> 'borrador') then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if not (coalesce((v_cfg ->> 'autopresente')::boolean, false) and coalesce((v_cfg ->> 'toma')::boolean, true)) then
    return jsonb_build_object('ok', false, 'error', 'autopresente_no_habilitado');
  end if;
  if not exists (select 1 from jsonb_array_elements(v_cfg -> 'instancias') i where i ->> 'id' = p_instancia) then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;
  if coalesce(p_modo, '') not in ('impreso', 'pantalla') then return jsonb_build_object('ok', false, 'error', 'datos_invalidos'); end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde or p_hasta < now() or p_hasta - p_desde > interval '7 days' then
    return jsonb_build_object('ok', false, 'error', 'horario_invalido');
  end if;
  -- 12 letras y números al azar (sin vocales para no formar palabras).
  loop
    v_codigo := (select string_agg(substr('bcdfghjkmnpqrstvwxz23456789', 1 + (get_byte(b, k) % 27), 1), '' order by k)
                   from (select extensions.gen_random_bytes(12) as b) x, generate_series(0, 11) k);
    exit when not exists (select 1 from public.autopresentes where codigo = v_codigo);
  end loop;
  v_pantalla := case when p_modo = 'pantalla' then encode(extensions.gen_random_bytes(24), 'hex') end;
  insert into public.autopresentes (evento_id, instancia, modo, codigo, pantalla, secreto, desde, hasta, creado_por)
  values (p_evento, p_instancia, p_modo, v_codigo, v_pantalla, encode(extensions.gen_random_bytes(24), 'hex'), p_desde, p_hasta, public.correo_actual())
  returning id into v_id;
  perform public.auditar('crear_autopresente', 'evento', p_evento, null,
    jsonb_build_object('id', v_id, 'instancia', p_instancia, 'modo', p_modo, 'desde', p_desde, 'hasta', p_hasta));
  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo, 'pantalla', v_pantalla);
end;
$$;
revoke all on function public.panel_crear_autopresente(text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.panel_crear_autopresente(text, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.panel_cerrar_autopresente(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.autopresentes;
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  update public.autopresentes set cerrado_en = now(), cerrado_por = public.correo_actual() where id = p_id and cerrado_en is null returning * into q;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_encontrada'); end if;
  perform public.auditar('cerrar_autopresente', 'evento', q.evento_id, null, jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_cerrar_autopresente(uuid) from public, anon;
grant execute on function public.panel_cerrar_autopresente(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Panel: presentes (versión de 018 + cuántos se anotaron solos en cada momento)
-- ---------------------------------------------------------------------
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
        'seAnotaronSolos', (select count(*) from public.asistencias a join public.inscripciones i on i.id = a.inscripcion_id
                       where a.evento_id = p_evento and a.instancia = inst ->> 'id' and a.estado = 'presente' and i.estado <> 'anulada' and a.origen = 'autopresente'),
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
                                          'marcadaEn', a.marcada_en, 'marcadoPor', a.marcado_por, 'origen', a.origen))
      from public.asistencias a where a.evento_id = p_evento and a.estado = 'presente'), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.panel_presentes(text) from public;
grant execute on function public.panel_presentes(text) to authenticated;

create or replace function public.version_base()
returns integer
language sql
immutable
as $$ select 19 $$;
revoke all on function public.version_base() from public, anon, authenticated;

select 'Autopresente con QR instalado' as resultado, public.version_base() as version;
