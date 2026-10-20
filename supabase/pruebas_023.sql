-- Pruebas de 023 (un QR de carga con varios eventos, D77). Base con 001 a 023 cargados y al menos un evento por persona.
--   psql -f supabase/pruebas_023.sql   (todo dentro de una transacción que se deshace al final)
\set ON_ERROR_STOP on
set client_min_messages = warning;
begin;
\i supabase/023_varios_eventos.sql
create or replace function pg_temp.ok(c boolean, msg text) returns text language plpgsql as $$
begin if c is not true then raise exception 'FALLÓ: %', msg; end if; return 'ok · ' || msg; end $$;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['responsable','organizador','tesorero'], true) ->> 'ok' as organizador;
insert into public.practicas_hechas (correo, paso) select 'carlos@gmail.com', unnest(array['crear','qr','inscripcion','presente','rendicion']) on conflict do nothing;

-- Tres campamentos (copias del congreso, en fechas distintas) y uno cerrado para inscribir.
insert into public.eventos (id, nombre, fecha, unidad, estado, es_modelo, definicion)
select 'camp-' || x, 'Campamento ' || upper(x), current_date + (n * 14), unidad, 'abierto', false, definicion
from (select * from public.eventos where not practica and unidad = 'persona' order by fecha desc limit 1) e, (values ('a', 1), ('b', 2), ('c', 3), ('d', 4)) v(x, n);
update public.eventos set estado = 'abierto' where id like 'camp-%';
update public.eventos set inscripciones_cerradas_en = now() where id = 'camp-d';

\echo '--- Crear el QR con tres eventos'
create temp table r as select public.panel_crear_acceso_varios(array['camp-b','camp-a','camp-c'], 'Ana Pérez', 'cargar', now() - interval '1 minute', now() + interval '4 hours') as j;
select pg_temp.ok((select (j ->> 'ok')::boolean from r), 'se crea');
select pg_temp.ok((select evento_id from public.accesos where id = (select (j ->> 'id')::uuid from r)) = 'camp-a', 'el principal es el de fecha más cercana');
select pg_temp.ok((select count(*) from public.acceso_eventos where acceso_id = (select (j ->> 'id')::uuid from r)) = 3, 'quedan los tres eventos');

\echo '--- Lo que no se permite'
select pg_temp.ok(public.panel_crear_acceso_varios(array['camp-a','camp-b'], 'Ana Pérez', 'presentes', now(), now() + interval '1 hour') ->> 'error' = 'varios_solo_carga', 'varios eventos solo para cargar');
select pg_temp.ok(public.panel_crear_acceso_varios(array['camp-a','camp-d'], 'Ana Pérez', 'cargar', now(), now() + interval '1 hour') ->> 'error' = 'inscripciones_cerradas', 'no con un evento cerrado para inscribir');
update public.eventos set practica = true where id = 'camp-c';
select pg_temp.ok(public.panel_crear_acceso_varios(array['camp-a','camp-c'], 'Ana Pérez', 'cargar', now(), now() + interval '1 hour') ->> 'error' = 'mezcla_practica', 'no mezcla práctica con eventos reales');
update public.eventos set practica = false where id = 'camp-c';
select pg_temp.ok(public.panel_crear_acceso_varios(array['camp-a'], 'Ana Pérez', 'presentes', now(), now() + interval '1 hour') ->> 'ok' = 'true', 'con un solo evento, igual que siempre (también puerta)');
reset request.jwt.claims;
select pg_temp.ok(public.panel_crear_acceso_varios(array['camp-a'], 'Ana Pérez', 'cargar', now(), now() + interval '1 hour') ->> 'error' = 'sin_permiso', 'sin rol Organizador, no');

\echo '--- El celular activa el QR y recibe los tres formularios'
create temp table cod as select public.panel_datos_accesos() as x;
-- (el código solo se conoce al crear: se arma uno nuevo con código conocido)
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
create temp table r2 as select public.panel_crear_acceso_varios(array['camp-c','camp-a','camp-b'], 'Beto Gómez', 'cargar', now() - interval '1 minute', now() + interval '4 hours') as j;
reset request.jwt.claims;
create temp table act as select public.activar_acceso((select j ->> 'codigo' from r2), 'celular-beto-123') as j;
select pg_temp.ok((select (j ->> 'ok')::boolean from act), 'se activa');
select pg_temp.ok((select jsonb_array_length(j -> 'eventos') from act) = 3, 'llegan los tres eventos');
select pg_temp.ok((select j -> 'eventos' -> 0 ->> 'id' from act) = 'camp-a' and (select j -> 'eventos' -> 2 ->> 'id' from act) = 'camp-c', 'ordenados por fecha');
select pg_temp.ok((select j -> 'evento' ->> 'id' from act) = 'camp-a', 'y el principal, para celulares con la versión anterior');
select pg_temp.ok((public.estado_sesion((select j ->> 'token' from act)) -> 'eventos') @> '[{"id":"camp-b","disponible":true}]', 'el estado trae cada evento');

\echo '--- Inscribir en el evento B'
create temp table ins as select public.enviar_inscripcion((select j ->> 'token' from act), jsonb_build_object(
  'id', gen_random_uuid(), 'eventoId', 'camp-b', 'creadaEn', now(), 'diaCarga', current_date, 'dispositivo', 'celular-beto-123',
  'categoria', 'adultos', 'datos', jsonb_build_object('nombre', 'Laura Díaz', 'dni', '35111222', 'telefono', '3624555666'),
  'conceptos', '[]'::jsonb, 'monto', 0, 'pago', jsonb_build_object('medio', 'efectivo'))) as j;
select pg_temp.ok((select (j ->> 'ok')::boolean from ins), 'se guarda');
select pg_temp.ok((select evento_id from public.inscripciones where datos ->> 'dni' = '35111222') = 'camp-b', 'queda en el evento B');
select pg_temp.ok(public.enviar_inscripcion((select j ->> 'token' from act), jsonb_build_object(
  'id', gen_random_uuid(), 'eventoId', (select id from public.eventos where id not like 'camp-%' limit 1), 'creadaEn', now(), 'diaCarga', current_date, 'dispositivo', 'x',
  'datos', '{}'::jsonb, 'conceptos', '[]'::jsonb, 'monto', 0, 'pago', jsonb_build_object('medio', 'efectivo'))) ->> 'error' = 'sin_permiso',
  'no se puede inscribir en un evento que no está en el QR');
select pg_temp.ok(public.enviar_inscripcion((select j ->> 'token' from act), jsonb_build_object(
  'id', gen_random_uuid(), 'creadaEn', now(), 'diaCarga', current_date, 'dispositivo', 'celular-beto-123', 'categoria', 'adultos',
  'datos', jsonb_build_object('nombre', 'Mario Sosa', 'dni', '20111222'), 'conceptos', '[]'::jsonb, 'monto', 0,
  'pago', jsonb_build_object('medio', 'efectivo'))) ->> 'ok' = 'true', 'sin evento elegido (celular viejo): va al principal');
select pg_temp.ok((select evento_id from public.inscripciones where datos ->> 'dni' = '20111222') = 'camp-a', 'el principal es A');

\echo '--- Si un evento cierra las inscripciones, el QR sigue con los otros'
update public.eventos set inscripciones_cerradas_en = now() where id in ('camp-a', 'camp-b');
select pg_temp.ok((public.activar_acceso((select j ->> 'codigo' from r2), 'celular-beto-123') -> 'eventos') = (select jsonb_build_array(j -> 'eventos' -> 2) from act), 'solo queda C');
update public.eventos set inscripciones_cerradas_en = now() where id = 'camp-c';
select pg_temp.ok(public.activar_acceso((select j ->> 'codigo' from r2), 'celular-beto-123') ->> 'error' = 'inscripciones_cerradas', 'con todos cerrados, avisa');

\echo '--- El panel muestra los eventos de cada QR'
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select pg_temp.ok((select jsonb_array_length(a -> 'eventoIds') from jsonb_array_elements(public.panel_datos_accesos() -> 'accesos') a where a ->> 'colaborador' = 'Beto Gómez') = 3, 'eventoIds con los tres');
rollback;
\echo 'TODAS LAS PRUEBAS DE 023 PASARON'
