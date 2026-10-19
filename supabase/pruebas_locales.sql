-- Pruebas de la base en un PostgreSQL local que imita a Supabase.
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
-- Desde acá, todo como la app (rol anon)
set role anon;
\echo '--- 1. código correcto'
select public.verificar_codigo('congreso-prueba','congreso-4821') as codigo_ok, public.verificar_codigo('congreso-prueba','MAL') as codigo_mal;
\echo '--- 2. inscripción nueva'
select public.recibir_inscripcion('CONGRESO-4821', '{"id":"11111111-1111-4111-8111-111111111111","eventoId":"congreso-prueba","cargador":"Ana","creadaEn":"2026-10-11T21:00:00-03:00","diaCarga":"2026-10-11","categoria":"adolescentes","datos":{"nombre":"Lucas","dni":"45.123.456","telefono":"3624555666"},"conceptos":[{"id":"matricula","monto":3250},{"id":"transporte","monto":3000}],"monto":6250,"pago":{"medio":"efectivo"}}');
\echo '--- 3. la misma otra vez (no se duplica)'
select public.recibir_inscripcion('CONGRESO-4821', '{"id":"11111111-1111-4111-8111-111111111111","eventoId":"congreso-prueba","cargador":"Ana","creadaEn":"2026-10-11T21:00:00-03:00","diaCarga":"2026-10-11","categoria":"adolescentes","datos":{"nombre":"Lucas","dni":"45123456"},"conceptos":[],"monto":6250,"pago":{"medio":"efectivo"}}');
\echo '--- 4. otra persona con el mismo DNI, cargada por otro cargador (posible duplicado)'
select public.recibir_inscripcion('CONGRESO-4821', '{"id":"22222222-2222-4222-8222-222222222222","eventoId":"congreso-prueba","cargador":"Beto","creadaEn":"2026-10-11T21:05:00-03:00","diaCarga":"2026-10-11","categoria":"adolescentes","datos":{"nombre":"Lucas G.","dni":"45123456"},"conceptos":[],"monto":6250,"pago":{"medio":"transferencia","banco":"MP","ultimos6":"A1B2C3"}}');
\echo '--- 5. código incorrecto'
select public.recibir_inscripcion('OTRO', '{"id":"33333333-3333-4333-8333-333333333333","eventoId":"congreso-prueba"}');
\echo '--- 6. transferencia sin los 6 caracteres'
select public.recibir_inscripcion('CONGRESO-4821', '{"id":"44444444-4444-4444-8444-444444444444","eventoId":"congreso-prueba","cargador":"Ana","creadaEn":"2026-10-11T21:00:00-03:00","diaCarga":"2026-10-11","datos":{},"conceptos":[],"monto":100,"pago":{"medio":"transferencia","banco":"MP"}}');
\echo '--- 7. evento inexistente'
select public.recibir_inscripcion('X', '{"id":"55555555-5555-4555-8555-555555555555","eventoId":"nada"}');
\echo '--- 8. la app NO puede leer la tabla directamente (tiene que dar error de permiso)'
\set ON_ERROR_STOP off
select count(*) from public.inscripciones;
\set ON_ERROR_STOP on
reset role;
\echo '--- 9. lo guardado'
select numero_orden, cargador, monto, medio_pago, ultimos6, estado, duplicado_de is not null as marca_dup from public.inscripciones order by numero_orden;
