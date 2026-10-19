-- =====================================================================
-- Revisión diaria y avisos automáticos (Etapa 9, punto 4; D58)
--  · Todos los días, GitHub corre «Revisión diaria» (herramientas/revision/revisar.mjs): revisa el
--    respaldo, que las bases estén activas, las llaves, el correo y el espacio, y guarda el resultado acá.
--  · Si algo necesita atención, manda un correo en castellano a los Responsables generales.
--  · El panel muestra el resultado (sección «Estado del sistema») y un cartel en el Resumen.
--  · Si la revisión deja de correr, el propio panel lo detecta (la última es de hace más de 36 horas).
-- Se ejecuta después de 001 a 015. Se puede volver a ejecutar sin problemas.
-- =====================================================================

create table if not exists public.revisiones (
  id         bigint generated always as identity primary key,
  cuando     timestamptz not null default now(),
  resultados jsonb not null,          -- [{id, estado: ok|aviso|problema, titulo, detalle, queHacer}]
  correo     text                     -- a quién se avisó (o el motivo por el que no se mandó)
);
create index if not exists revisiones_cuando_idx on public.revisiones (cuando desc);
alter table public.revisiones enable row level security;
revoke all on public.revisiones from anon, authenticated;

-- Versión de la base: el número del último archivo SQL cargado. La revisión la compara con la del código
-- para avisar si falta tocar «Actualizar». Cada archivo nuevo tiene que cambiar este número.
create or replace function public.version_base()
returns integer
language sql
immutable
as $$ select 16 $$;
revoke all on function public.version_base() from public, anon, authenticated;

-- La llama solo la revisión diaria (conexión directa a la base, nunca la app). Guarda y devuelve
-- la revisión anterior, para no repetir por correo un aviso que ya se mandó.
create or replace function public.registrar_revision(p_resultados jsonb, p_correo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior jsonb;
begin
  select resultados into v_anterior from public.revisiones order by cuando desc limit 1;
  insert into public.revisiones (resultados, correo) values (p_resultados, p_correo);
  delete from public.revisiones where cuando < now() - interval '120 days';
  return coalesce(v_anterior, '[]'::jsonb);
end;
$$;
revoke all on function public.registrar_revision(jsonb, text) from public, anon, authenticated;

-- Lo que comprueba la base en el momento (lo usan la revisión diaria y el botón «Revisar ahora» del panel).
create or replace function public.revision_base()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', public.version_base(),
    'espacioUsado', pg_database_size(current_database()),
    'espacioLimite', 500 * 1024 * 1024,      -- plan gratuito de Supabase: 500 MB
    'responsables', coalesce((
      select jsonb_agg(u.email order by u.email) from public.usuarios u
      join public.roles_usuario r on r.usuario_id = u.id and r.rol = 'responsable'
      where u.activo), '[]'::jsonb));
$$;
revoke all on function public.revision_base() from public, anon, authenticated;

-- Panel (Responsable general): la última revisión, cuánto hace y lo que se puede comprobar ahora.
create or replace function public.panel_revision()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.revisiones;
  b jsonb := public.revision_base();
begin
  if not public.tengo_rol('responsable') then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select * into v from public.revisiones order by cuando desc limit 1;
  return jsonb_build_object(
    'ok', true,
    'ahora', now(),
    'ultima', case when v.id is null then null else jsonb_build_object('cuando', v.cuando, 'resultados', v.resultados, 'correo', v.correo) end,
    'horasDesdeUltima', case when v.id is null then null else round(extract(epoch from now() - v.cuando) / 3600) end,
    'version', b -> 'version',
    'espacioUsado', b -> 'espacioUsado',
    'espacioLimite', b -> 'espacioLimite');
end;
$$;
revoke all on function public.panel_revision() from public, anon;
grant execute on function public.panel_revision() to authenticated;

select 'Revisión diaria instalada' as resultado, public.version_base() as version;
