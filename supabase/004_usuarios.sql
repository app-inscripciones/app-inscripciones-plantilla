-- =====================================================================
-- Etapa 4.1 · Ingreso de administradores, personas y roles, auditoría
-- Se ejecuta UNA VEZ en el editor SQL de Supabase (SQL Editor → Run),
-- después de 001, 002 y 003. Se puede volver a ejecutar sin problemas.
--
--  · usuarios / roles_usuario: quién puede entrar al panel y con qué roles (D17).
--    El ingreso es con código por correo (D39): Supabase verifica el correo
--    y estas funciones verifican que esté habilitado y qué puede hacer.
--  · auditoria: quién hizo cada cambio, cuándo, y cómo estaba antes y después.
--  · Funciones del panel para los QR (reemplazan a la clave de organizador de D37).
-- =====================================================================

create table if not exists public.usuarios (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique check (email = lower(trim(email)) and email like '%@%.%'),
  nombre     text not null check (length(nombre) between 2 and 120),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create table if not exists public.roles_usuario (
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  rol        text not null check (rol in ('responsable', 'organizador', 'tesorero', 'consulta')),
  primary key (usuario_id, rol)
);

create table if not exists public.auditoria (
  id         bigint generated always as identity primary key,
  cuando     timestamptz not null default now(),
  quien      text not null,                 -- correo del administrador (o «sistema»)
  accion     text not null,
  entidad    text not null,
  entidad_id text,
  antes      jsonb,
  despues    jsonb
);
create index if not exists auditoria_entidad_idx on public.auditoria (entidad, entidad_id);

alter table public.usuarios enable row level security;
alter table public.roles_usuario enable row level security;
alter table public.auditoria enable row level security;
revoke all on public.usuarios, public.roles_usuario, public.auditoria from anon, authenticated;

-- Quién creó cada QR (desde el panel).
alter table public.accesos add column if not exists creado_por text;

-- ---------------------------------------------------------------------
-- Ayudantes internos
-- ---------------------------------------------------------------------
-- Correo verificado de quien llama (lo pone Supabase al ingresar con el código).
create or replace function public.correo_actual()
returns text
language sql
stable
set search_path = public
as $$
  select lower(nullif(auth.jwt() ->> 'email', ''));
$$;
revoke all on function public.correo_actual() from public, anon, authenticated;

-- Roles del administrador que llama (vacío si no está habilitado).
create or replace function public.mis_roles()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(r.rol order by r.rol), '{}')
  from public.usuarios u join public.roles_usuario r on r.usuario_id = u.id
  where u.email = public.correo_actual() and u.activo;
$$;
revoke all on function public.mis_roles() from public, anon, authenticated;

create or replace function public.tengo_rol(p_rol text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_rol = any(public.mis_roles());
$$;
revoke all on function public.tengo_rol(text) from public, anon, authenticated;

create or replace function public.auditar(p_accion text, p_entidad text, p_id text, p_antes jsonb, p_despues jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.auditoria (quien, accion, entidad, entidad_id, antes, despues)
  values (coalesce(public.correo_actual(), 'sistema'), p_accion, p_entidad, p_id, p_antes, p_despues);
$$;
revoke all on function public.auditar(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Primer Responsable general. Solo desde el editor SQL y solo si no hay ninguno:
--   select public.alta_primer_responsable('correo@gmail.com', 'Nombre Apellido');
-- ---------------------------------------------------------------------
create or replace function public.alta_primer_responsable(p_email text, p_nombre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.roles_usuario where rol = 'responsable') then
    raise exception 'Ya hay un Responsable general. Las demás personas se dan de alta desde el panel.';
  end if;
  insert into public.usuarios (email, nombre) values (lower(trim(p_email)), trim(p_nombre))
  on conflict (email) do update set nombre = excluded.nombre, activo = true
  returning id into v_id;
  insert into public.roles_usuario (usuario_id, rol) values (v_id, 'responsable') on conflict do nothing;
  insert into public.auditoria (quien, accion, entidad, entidad_id, despues)
  values ('sistema', 'alta_primer_responsable', 'usuario', v_id::text, jsonb_build_object('email', lower(trim(p_email))));
  return 'Responsable general dado de alta: ' || lower(trim(p_email));
end;
$$;
revoke all on function public.alta_primer_responsable(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Antes de pedir el código: ¿este correo está habilitado? (para un aviso claro)
-- ---------------------------------------------------------------------
create or replace function public.correo_habilitado(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios where email = lower(trim(p_email)) and activo);
$$;
revoke all on function public.correo_habilitado(text) from public;
grant execute on function public.correo_habilitado(text) to anon, authenticated;

-- Hook de Supabase Auth «Before User Created»: solo se crean cuentas de correos habilitados.
create or replace function public.hook_antes_de_crear_usuario(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.usuarios where email = lower(event -> 'user' ->> 'email') and activo) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'message', 'Este correo no está habilitado. Pedile al Responsable general que te dé de alta.', 'http_code', 403));
end;
$$;
revoke all on function public.hook_antes_de_crear_usuario(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.hook_antes_de_crear_usuario(jsonb) to supabase_auth_admin';
    execute 'grant usage on schema public to supabase_auth_admin';
    execute 'grant select on public.usuarios to supabase_auth_admin';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- PANEL · mi_perfil: quién soy y qué roles tengo.
-- ---------------------------------------------------------------------
create or replace function public.mi_perfil()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u public.usuarios;
begin
  select * into u from public.usuarios where email = public.correo_actual() and activo;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_habilitado', 'email', public.correo_actual());
  end if;
  return jsonb_build_object('ok', true, 'email', u.email, 'nombre', u.nombre, 'roles', to_jsonb(public.mis_roles()));
end;
$$;
revoke all on function public.mi_perfil() from public;
grant execute on function public.mi_perfil() to authenticated;

-- ---------------------------------------------------------------------
-- PANEL · Personas y roles (solo Responsable general)
-- ---------------------------------------------------------------------
create or replace function public.panel_usuarios()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tengo_rol('responsable') then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  return jsonb_build_object('ok', true, 'usuarios', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'email', u.email, 'nombre', u.nombre, 'activo', u.activo,
      'roles', coalesce((select jsonb_agg(r.rol order by r.rol) from public.roles_usuario r where r.usuario_id = u.id), '[]'::jsonb)
    ) order by u.activo desc, u.nombre)
    from public.usuarios u), '[]'::jsonb));
end;
$$;
revoke all on function public.panel_usuarios() from public;
grant execute on function public.panel_usuarios() to authenticated;

create or replace function public.panel_guardar_usuario(p_email text, p_nombre text, p_roles text[], p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_roles  text[] := coalesce((select array_agg(distinct r order by r) from unnest(p_roles) r), '{}');
  v_id     uuid;
  v_antes  jsonb;
  v_despues jsonb;
begin
  if not public.tengo_rol('responsable') then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'correo_invalido');
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 120 then
    return jsonb_build_object('ok', false, 'error', 'nombre_invalido');
  end if;
  if not v_roles <@ array['responsable', 'organizador', 'tesorero', 'consulta'] then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;

  select id, jsonb_build_object('nombre', nombre, 'activo', activo,
           'roles', (select coalesce(jsonb_agg(rol order by rol), '[]'::jsonb) from public.roles_usuario where usuario_id = u.id))
    into v_id, v_antes
  from public.usuarios u where email = v_email;

  -- Nunca puede quedar el sistema sin un Responsable general activo.
  if v_id is not null and (not coalesce(p_activo, true) or not ('responsable' = any(v_roles)))
     and exists (select 1 from public.roles_usuario where usuario_id = v_id and rol = 'responsable')
     and (select count(*) from public.roles_usuario r join public.usuarios u on u.id = r.usuario_id
          where r.rol = 'responsable' and u.activo and u.id <> v_id) = 0 then
    return jsonb_build_object('ok', false, 'error', 'ultimo_responsable');
  end if;

  insert into public.usuarios (email, nombre, activo) values (v_email, v_nombre, coalesce(p_activo, true))
  on conflict (email) do update set nombre = excluded.nombre, activo = excluded.activo
  returning id into v_id;
  delete from public.roles_usuario where usuario_id = v_id and not (rol = any(v_roles));
  insert into public.roles_usuario (usuario_id, rol) select v_id, r from unnest(v_roles) r on conflict do nothing;

  v_despues := jsonb_build_object('nombre', v_nombre, 'activo', coalesce(p_activo, true), 'roles', to_jsonb(v_roles));
  perform public.auditar(case when v_antes is null then 'alta_usuario' else 'modificar_usuario' end,
                         'usuario', v_email, v_antes, v_despues);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.panel_guardar_usuario(text, text, text[], boolean) from public;
grant execute on function public.panel_guardar_usuario(text, text, text[], boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Accesos QR: lógica común (clave provisoria de D37 y panel con usuario)
-- ---------------------------------------------------------------------
create or replace function public._datos_accesos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'ahora', now(),
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'fecha', e.fecha) order by e.fecha)
      from public.eventos e where e.estado = 'abierto'), '[]'::jsonb),
    'colaboradores', coalesce((select jsonb_agg(c.nombre order by c.nombre) from public.colaboradores c), '[]'::jsonb),
    'accesos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'eventoId', a.evento_id, 'colaborador', c.nombre, 'tarea', a.tarea,
        'desde', a.desde, 'hasta', a.hasta, 'cerradoEn', a.cerrado_en, 'creadoEn', a.creado_en, 'creadoPor', a.creado_por,
        'dispositivos', (select count(*) from public.sesiones s where s.acceso_id = a.id),
        'ultimaConexion', (select max(s.ultima_conexion) from public.sesiones s where s.acceso_id = a.id),
        'inscripciones', (select count(*) from public.inscripciones i
                          join public.sesiones s on s.id = i.sesion_id where s.acceso_id = a.id)
      ) order by a.creado_en desc)
      from public.accesos a join public.colaboradores c on c.id = a.colaborador_id
      where a.hasta > now() - interval '30 days'), '[]'::jsonb));
$$;
revoke all on function public._datos_accesos() from public, anon, authenticated;

create or replace function public._crear_acceso(p_evento text, p_nombre text, p_tarea text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_colab  uuid;
  v_codigo text;
  v_id     uuid;
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if not exists (select 1 from public.eventos where id = p_evento and estado = 'abierto') then
    return jsonb_build_object('ok', false, 'error', 'evento_cerrado');
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 120 then
    return jsonb_build_object('ok', false, 'error', 'nombre_invalido');
  end if;
  if p_tarea not in ('cargar', 'presentes') then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde or p_hasta <= now()
     or p_hasta - p_desde > interval '7 days' then
    return jsonb_build_object('ok', false, 'error', 'horario_invalido');
  end if;

  insert into public.colaboradores (nombre) values (v_nombre)
  on conflict (nombre) do update set nombre = excluded.nombre
  returning id into v_colab;

  loop
    v_codigo := public.nuevo_codigo_corto();
    begin
      insert into public.accesos (evento_id, colaborador_id, tarea, desde, hasta, codigo_hash, creado_por)
      values (p_evento, v_colab, p_tarea, p_desde, p_hasta, public.huella_acceso(v_codigo), coalesce(public.correo_actual(), 'clave de organizador'))
      returning id into v_id;
      exit;
    exception when unique_violation then
    end;
  end loop;

  perform public.auditar('crear_acceso', 'acceso', v_id::text, null,
    jsonb_build_object('evento', p_evento, 'colaborador', v_nombre, 'tarea', p_tarea, 'desde', p_desde, 'hasta', p_hasta));
  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo);
end;
$$;
revoke all on function public._crear_acceso(text, text, text, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public._cerrar_acceso(p_acceso uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.accesos set cerrado_en = coalesce(cerrado_en, now()) where id = p_acceso;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'acceso_inexistente');
  end if;
  perform public.auditar('cerrar_acceso', 'acceso', p_acceso::text, null, null);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public._cerrar_acceso(uuid) from public, anon, authenticated;

-- Versión con clave (provisoria, D37): ahora usa la lógica común.
create or replace function public.org_datos(p_clave text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.clave_organizador_ok(p_clave) then return jsonb_build_object('ok', false, 'error', 'clave_invalida'); end if;
  return public._datos_accesos();
end; $$;
create or replace function public.org_crear_acceso(p_clave text, p_evento text, p_nombre text, p_tarea text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.clave_organizador_ok(p_clave) then return jsonb_build_object('ok', false, 'error', 'clave_invalida'); end if;
  return public._crear_acceso(p_evento, p_nombre, p_tarea, p_desde, p_hasta);
end; $$;
create or replace function public.org_cerrar_acceso(p_clave text, p_acceso uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.clave_organizador_ok(p_clave) then return jsonb_build_object('ok', false, 'error', 'clave_invalida'); end if;
  return public._cerrar_acceso(p_acceso);
end; $$;

-- Versión del panel (con usuario y rol Organizador).
create or replace function public.panel_datos_accesos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return public._datos_accesos();
end; $$;
revoke all on function public.panel_datos_accesos() from public;
grant execute on function public.panel_datos_accesos() to authenticated;

create or replace function public.panel_crear_acceso(p_evento text, p_nombre text, p_tarea text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return public._crear_acceso(p_evento, p_nombre, p_tarea, p_desde, p_hasta);
end; $$;
revoke all on function public.panel_crear_acceso(text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.panel_crear_acceso(text, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.panel_cerrar_acceso(p_acceso uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  return public._cerrar_acceso(p_acceso);
end; $$;
revoke all on function public.panel_cerrar_acceso(uuid) from public;
grant execute on function public.panel_cerrar_acceso(uuid) to authenticated;

-- Para revisar: debe decir «Etapa 4.1 instalada».
select 'Etapa 4.1 instalada' as resultado,
       (select count(*) from public.roles_usuario where rol = 'responsable') as responsables;
