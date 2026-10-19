-- Pruebas de 021 (practicar antes de hacerlo de verdad, D66). Base con 001 a 021 cargados.
--   psql -v prac="$(node herramientas/pruebas-integradas/defpract.mjs $(date +%F))" -f supabase/pruebas_021.sql
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/021_practica_previa.sql
\i supabase/021_practica_previa.sql
create or replace function pg_temp.ok(c boolean, msg text) returns text language plpgsql as $$
begin if c is not true then raise exception 'FALLÓ: %', msg; end if; return 'ok · ' || msg; end $$;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['responsable','organizador','tesorero'], true) ->> 'ok' as organizador;
select public.panel_guardar_usuario('marta@gmail.com', 'Marta López', array['tesorero'], true) ->> 'ok' as tesorera;
delete from public.practicas_hechas;

\echo '--- Nadie practicó todavía'
select pg_temp.ok(public.panel_mi_practica() ->> 'organizadorHecha' = 'false', 'Organizador: falta'),
       pg_temp.ok(public.panel_mi_practica() ->> 'alguienPracticoOrganizador' = 'false', 'nadie del equipo');

\echo '--- Un evento real no cuenta'
select public.panel_crear_acceso('congreso-prueba', 'Real Uno', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'ok' as qr_real;
select pg_temp.ok(public.panel_mi_practica() -> 'pasos' = '{}'::jsonb, 'un QR de un evento real no suma práctica');

\echo '--- La práctica, paso por paso'
select public.panel_crear_practica(:'prac') ->> 'id' as pr \gset
select pg_temp.ok(public.panel_mi_practica() -> 'pasos' ? 'crear', 'crear la práctica');
select public.panel_crear_acceso(:'pr', 'Voluntaria', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c \gset
select pg_temp.ok(public.panel_mi_practica() -> 'pasos' ? 'qr', 'QR en la práctica');
select public.activar_acceso(:'c', 'disp-021-01') ->> 'token' as t \gset
select (public.enviar_inscripcion(:'t', jsonb_build_object('id', 'c0000000-0000-4000-8000-000000000001', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre":"Ana Sosa","dni":"30111222","telefono":"3624111222","edad":"25","categoria":"jovenes","transporte":"no","restricciones":"no"}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 1, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok') as envio;
select pg_temp.ok(public.panel_mi_practica() -> 'pasos' ? 'inscripcion', 'llegó una inscripción a la práctica (a nombre de quien la creó)');
select pg_temp.ok(public.panel_mi_practica() ->> 'organizadorHecha' = 'false', 'falta el presente');
insert into public.asistencias (id, evento_id, inscripcion_id, instancia, persona, marcado_por, sesion_id, marcada_en)
select gen_random_uuid(), :'pr', 'c0000000-0000-4000-8000-000000000001', public.config_asistencia(:'pr') -> 'instancias' -> 0 ->> 'id', '', 'Puerta', null, now();
select pg_temp.ok(public.panel_mi_practica() ->> 'organizadorHecha' = 'true', 'con el presente: práctica de Organizador completa'),
       pg_temp.ok(public.panel_mi_practica() ->> 'alguienPracticoOrganizador' = 'true', 'el equipo ya tiene a alguien que practicó'),
       pg_temp.ok(public.panel_mi_practica() ->> 'tesoreroHecha' = 'false', 'Tesorero: todavía no');

\echo '--- Tesorero: una rendición en la práctica'
set request.jwt.claims = '{"email":"marta@gmail.com"}';
select pg_temp.ok(public.panel_mi_practica() ->> 'tesoreroHecha' = 'false', 'Marta todavía no');
select public.panel_registrar_rendicion(:'pr', 'Voluntaria', 1, 'práctica', 0) ->> 'ok' as rinde;
select pg_temp.ok(public.panel_mi_practica() ->> 'tesoreroHecha' = 'true', 'Marta: práctica de Tesorero hecha'),
       pg_temp.ok(public.panel_mi_practica() ->> 'organizadorHecha' = 'false', 'Marta no practicó como Organizadora');

\echo '--- Se conserva cuando la práctica se borra sola'
reset role;
update public.eventos set fecha = current_date - 30, definicion = definicion || jsonb_build_object('fecha', (current_date - 30)::text, 'fechaFin', (current_date - 24)::text) where id = :'pr';
select public.limpiar_practicas() as limpieza;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select pg_temp.ok(not exists (select 1 from public.eventos where id = :'pr'), 'la práctica ya no existe'),
       pg_temp.ok(public.panel_mi_practica() ->> 'organizadorHecha' = 'true', 'la práctica hecha sigue anotada');

\echo '--- Seguridad'
reset role; set role anon;
select pg_temp.ok(not has_function_privilege('anon', 'public.panel_mi_practica()', 'execute'), 'anon no la ve'),
       pg_temp.ok(not has_table_privilege('authenticated', 'public.practicas_hechas', 'select'), 'la tabla no se lee desde la app'),
       pg_temp.ok(not has_function_privilege('authenticated', 'public._anotar_practica(text, text)', 'execute'), 'nadie anota a mano');
reset role;
select 'Pruebas de la práctica previa: todo OK' as resultado;
