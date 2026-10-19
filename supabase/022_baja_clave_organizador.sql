-- =====================================================================
-- 022 · Baja de la pantalla provisoria «Organizar» y de la clave de organizador (D37 → D72)
-- Desde la Etapa 4 los QR se crean en el panel, con usuario y rol Organizador.
-- Se borran las funciones que entraban con la clave y la huella de la clave. No toca ningún dato.
-- Se puede ejecutar más de una vez.
-- =====================================================================
drop function if exists public.org_datos(text);
drop function if exists public.org_crear_acceso(text, text, text, text, timestamptz, timestamptz);
drop function if exists public.org_cerrar_acceso(text, uuid);
drop function if exists public.fijar_clave_organizador(text);
drop function if exists public.clave_organizador_ok(text);
delete from public.ajustes where clave = 'clave_organizador';

create or replace function public.version_base()
returns integer
language sql
immutable
as $$ select 22 $$;
revoke all on function public.version_base() from public, anon, authenticated;

select 'Clave de organizador dada de baja' as resultado, public.version_base() as version;
