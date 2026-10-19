-- =====================================================================
-- D35 · Datos de la institución cargados desde la app (no desde archivos)
-- y D32 · Momentos de asistencia que se agregan con el evento abierto.
-- Se ejecuta UNA VEZ en el editor SQL de Supabase, después de 001 a 007.
-- Se puede volver a ejecutar sin problemas.
-- =====================================================================

create table if not exists public.institucion (
  id               integer primary key default 1 check (id = 1),   -- una sola fila
  nombre           text not null check (length(nombre) between 2 and 120),
  nombre_app       text not null default 'Inscripciones' check (length(nombre_app) between 2 and 40),
  color_principal  text not null default '#1F4E79' check (color_principal ~ '^#[0-9A-Fa-f]{6}$'),
  color_fondo      text not null default '#F6F7F9' check (color_fondo ~ '^#[0-9A-Fa-f]{6}$'),
  logo             text check (logo is null or (logo like 'data:image/%' and length(logo) <= 400000)),
  aviso_salud      text,
  contacto         text,
  actualizada_en   timestamptz not null default now()
);
alter table public.institucion enable row level security;
revoke all on public.institucion from anon, authenticated;

-- Pública: la app la necesita para mostrar el nombre, los colores y el logo (no tiene datos sensibles).
create or replace function public.institucion_publica()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select jsonb_build_object(
      'configurada', true, 'nombre', nombre, 'nombreApp', nombre_app, 'colorPrincipal', color_principal,
      'colorFondo', color_fondo, 'logo', logo, 'avisoSalud', aviso_salud, 'contacto', contacto, 'actualizadaEn', actualizada_en)
    from public.institucion where id = 1), jsonb_build_object('configurada', false));
$$;
revoke all on function public.institucion_publica() from public;
grant execute on function public.institucion_publica() to anon, authenticated;

-- Solo el Responsable general.
create or replace function public.panel_guardar_institucion(
  p_nombre text, p_nombre_app text, p_color_principal text, p_color_fondo text,
  p_logo text, p_aviso_salud text, p_contacto text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb := public.institucion_publica();
begin
  if not public.tengo_rol('responsable') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  begin
    insert into public.institucion (id, nombre, nombre_app, color_principal, color_fondo, logo, aviso_salud, contacto, actualizada_en)
    values (1, trim(p_nombre), trim(coalesce(nullif(p_nombre_app, ''), 'Inscripciones')), upper(p_color_principal), upper(p_color_fondo),
            nullif(p_logo, ''), nullif(trim(coalesce(p_aviso_salud, '')), ''), nullif(trim(coalesce(p_contacto, '')), ''), now())
    on conflict (id) do update set nombre = excluded.nombre, nombre_app = excluded.nombre_app,
      color_principal = excluded.color_principal, color_fondo = excluded.color_fondo, logo = excluded.logo,
      aviso_salud = excluded.aviso_salud, contacto = excluded.contacto, actualizada_en = now();
  exception when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end;
  perform public.auditar('guardar_institucion', 'institucion', '1', v_antes - 'logo', public.institucion_publica() - 'logo');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.panel_guardar_institucion(text, text, text, text, text, text, text) from public;
grant execute on function public.panel_guardar_institucion(text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- D32 · Momentos de asistencia con el evento abierto (Organizador)
--  p_instancias: lista completa [{id?, nombre, fecha, turno?}]. Se pueden agregar;
--  un momento solo se puede renombrar o borrar si todavía nadie fue marcado en él.
-- ---------------------------------------------------------------------
create or replace function public.panel_guardar_instancias(p_evento text, p_instancias jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
  v_antes jsonb;
  v_nuevas jsonb := '[]'::jsonb;
  i jsonb;
  v_id text;
  v_usadas text[];
begin
  if not public.tengo_rol('organizador') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v_ev from public.eventos where id = p_evento;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_inexistente'); end if;
  if p_instancias is null or jsonb_typeof(p_instancias) <> 'array' or jsonb_array_length(p_instancias) = 0
     or jsonb_array_length(p_instancias) > 30 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  v_antes := public.config_asistencia(p_evento) -> 'instancias';
  select coalesce(array_agg(distinct instancia), '{}') into v_usadas from public.asistencias where evento_id = p_evento and estado = 'presente';

  for i in select * from jsonb_array_elements(p_instancias) loop
    if length(trim(coalesce(i ->> 'nombre', ''))) < 2 or (i ->> 'fecha') !~ '^\d{4}-\d{2}-\d{2}$' then
      return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
    end if;
    v_id := coalesce(nullif(i ->> 'id', ''), 'm' || substr(md5(random()::text), 1, 8));
    -- Un momento con marcas no se puede cambiar.
    if v_id = any(v_usadas) and exists (select 1 from jsonb_array_elements(v_antes) a
         where a ->> 'id' = v_id and (a ->> 'nombre' is distinct from trim(i ->> 'nombre') or a ->> 'fecha' is distinct from i ->> 'fecha'
                                      or coalesce(a ->> 'turno', '') is distinct from coalesce(i ->> 'turno', ''))) then
      return jsonb_build_object('ok', false, 'error', 'instancia_con_marcas');
    end if;
    v_nuevas := v_nuevas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', v_id, 'nombre', trim(i ->> 'nombre'),
                  'fecha', i ->> 'fecha', 'turno', nullif(i ->> 'turno', ''))));
  end loop;
  -- Tampoco se puede borrar un momento con marcas.
  if exists (select 1 from unnest(v_usadas) u where not exists (select 1 from jsonb_array_elements(v_nuevas) n where n ->> 'id' = u)) then
    return jsonb_build_object('ok', false, 'error', 'instancia_con_marcas');
  end if;

  update public.eventos
     set definicion = jsonb_set(coalesce(definicion, '{}'::jsonb), '{asistencia}',
                                coalesce(definicion -> 'asistencia', '{}'::jsonb) || jsonb_build_object('instancias', v_nuevas))
   where id = p_evento;
  -- Los celulares de la puerta reciben la configuración nueva en su próxima sincronización.
  perform public.auditar('guardar_instancias', 'evento', p_evento, v_antes, v_nuevas);
  return jsonb_build_object('ok', true, 'instancias', v_nuevas);
end;
$$;
revoke all on function public.panel_guardar_instancias(text, jsonb) from public;
grant execute on function public.panel_guardar_instancias(text, jsonb) to authenticated;

select 'Institución y momentos de asistencia instalados' as resultado,
       (public.institucion_publica() ->> 'configurada') as institucion_configurada;
