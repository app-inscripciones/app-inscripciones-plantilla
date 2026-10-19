-- Pruebas de la Etapa 3 en un PostgreSQL local que imita a Supabase.
-- Uso: psql -f supabase/pruebas_etapa3.sql  (base vacía)
\set ON_ERROR_STOP on
set client_min_messages = warning;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists extensions;
grant usage on schema public to anon, authenticated;
\i supabase/001_base.sql
\i supabase/002_eventos_modelo.sql
\i supabase/003_accesos_qr.sql
\i supabase/003_accesos_qr.sql

\echo '--- 0. clave de organizador (solo desde el editor SQL)'
select public.fijar_clave_organizador('clave-de-prueba-larga');

set role anon;
\echo '--- 1. la app ya no puede usar el código del evento de la Etapa 2 (error de permiso esperado)'
\set ON_ERROR_STOP off
select public.recibir_inscripcion('CONGRESO-4821', '{}');
select public.fijar_clave_organizador('otra-clave-cualquiera');
\set ON_ERROR_STOP on

\echo '--- 2. clave incorrecta'
select public.org_datos('mala');

\echo '--- 3. crear accesos (cargar ahora; presentes; uno vencido no se puede crear)'
select (public.org_crear_acceso('clave-de-prueba-larga', 'congreso-prueba', '  Ana   Pérez ', 'cargar', now() - interval '1 hour', now() + interval '4 hours'))->>'codigo' as cod_ana \gset
select (public.org_crear_acceso('clave-de-prueba-larga', 'congreso-prueba', 'Juan Ríos', 'presentes', now(), now() + interval '2 hours'))->>'codigo' as cod_juan \gset
select :'cod_ana' ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$' as formato_ok;
select public.org_crear_acceso('clave-de-prueba-larga', 'congreso-prueba', 'Ana Pérez', 'cargar', now() - interval '3 hours', now() - interval '1 hour') as vencido_rechazado;
select public.org_crear_acceso('clave-de-prueba-larga', 'nada', 'Ana Pérez', 'cargar', now(), now() + interval '1 hour') as evento_inexistente;

\echo '--- 4. activar con código mal escrito, y con el bueno en minúsculas y sin guion'
select public.activar_acceso('XXXX-XXXX', 'dispositivo-0001')->>'error' as mal;
select (public.activar_acceso(lower(replace(:'cod_ana', '-', '')), 'dispositivo-0001')) - 'token' - 'evento' - 'sesionId' as activado;
select (public.activar_acceso(:'cod_ana', 'dispositivo-0001'))->>'token' as token_ana \gset
select (public.activar_acceso(:'cod_ana', 'dispositivo-0001'))->'evento'->>'nombre' as evento_recibido;
\echo '--- 5. el mismo QR en otro celular: no'
select public.activar_acceso(:'cod_ana', 'dispositivo-0002')->>'error' as otro_celular;
\echo '--- 6. la llave vieja quedó reemplazada por la nueva al reactivar'
select (public.activar_acceso(:'cod_ana', 'dispositivo-0001'))->>'token' as token_ana \gset
select public.estado_sesion(:'token_ana')->>'ok' as estado_ok, public.estado_sesion('llave-falsa')->>'error' as llave_falsa;

\echo '--- 7. enviar inscripción dentro del horario'
select public.enviar_inscripcion(:'token_ana', jsonb_build_object(
  'id','11111111-1111-4111-8111-111111111111','cargador','Otro nombre (se ignora)','eventoId','retiro-matrimonios',
  'creadaEn', now(), 'diaCarga', current_date, 'categoria','adolescentes',
  'datos', '{"nombre":"Lucas","dni":"45.123.456"}'::jsonb, 'conceptos','[]'::jsonb, 'monto', 6250, 'pago','{"medio":"efectivo"}'::jsonb));
\echo '--- 8. la misma otra vez: no se duplica'
select public.enviar_inscripcion(:'token_ana', jsonb_build_object('id','11111111-1111-4111-8111-111111111111','creadaEn', now()))->>'repetida' as repetida;
\echo '--- 9. control de presentes no puede inscribir'
select (public.activar_acceso(:'cod_juan', 'dispositivo-0003'))->>'token' as token_juan \gset
select public.enviar_inscripcion(:'token_juan', '{"id":"22222222-2222-4222-8222-222222222222","creadaEn":"2026-01-01T00:00:00Z"}')->>'error' as sin_permiso;

\echo '--- 10. cierre manual: no se puede activar más, pero lo cargado antes se sigue enviando (modo solo envío)'
reset role;
select id as acc_ana from public.accesos a where exists (select 1 from public.colaboradores c where c.id=a.colaborador_id and c.nombre='Ana Pérez') \gset
set role anon;
select public.org_cerrar_acceso('clave-de-prueba-larga', :'acc_ana');
select public.activar_acceso(:'cod_ana', 'dispositivo-0001')->>'error' as reactivar_cerrado;
select public.estado_sesion(:'token_ana')->>'cerradoEn' is not null as celular_se_entera;
select public.enviar_inscripcion(:'token_ana', jsonb_build_object(
  'id','33333333-3333-4333-8333-333333333333','creadaEn', now() - interval '30 minutes','diaCarga', current_date,
  'datos','{"nombre":"Antes del cierre","dni":"30111222"}'::jsonb,'conceptos','[]'::jsonb,'monto',100,'pago','{"medio":"efectivo"}'::jsonb)) - 'numeroOrden' as antes_del_cierre;
\echo '--- 11. cargada DESPUÉS del cierre (celular sin internet): se guarda marcada fuera de horario'
select public.enviar_inscripcion(:'token_ana', jsonb_build_object(
  'id','44444444-4444-4444-8444-444444444444','creadaEn', now() + interval '20 minutes','diaCarga', current_date,
  'datos','{"nombre":"Después","dni":"45123456"}'::jsonb,'conceptos','[]'::jsonb,'monto',100,
  'pago','{"medio":"transferencia","banco":"MP","ultimos6":"A1B2C3"}'::jsonb)) - 'numeroOrden' as despues_del_cierre;

\echo '--- 12. la app no puede leer tablas (error de permiso esperado)'
\set ON_ERROR_STOP off
select count(*) from public.accesos;
select count(*) from public.sesiones;
\set ON_ERROR_STOP on

\echo '--- 13. el organizador ve el estado de los accesos'
select jsonb_path_query(public.org_datos('clave-de-prueba-larga'), '$.accesos[*] ? (@.colaborador == "Ana Pérez")') - 'id' - 'desde' - 'hasta' - 'creadoEn' - 'cerradoEn' - 'ultimaConexion' as acceso_ana;

reset role;
\echo '--- 14. lo guardado (el cargador sale del acceso, no de lo que mandó el celular)'
select numero_orden, cargador, evento_id, monto, estado, fuera_de_horario, sesion_id is not null as con_sesion
from public.inscripciones order by numero_orden;
\echo '--- 15. en la base no hay códigos ni llaves en texto'
select count(*) filter (where codigo_hash ~ '^[0-9a-f]{64}$') as huellas_ok, count(*) as total from public.accesos;
