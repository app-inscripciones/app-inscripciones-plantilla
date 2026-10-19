-- Pruebas de 010 (después de pruebas_009.sql en la misma base).
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/009_asistente_eventos.sql
\i supabase/010_cierre_y_sin_cobro.sql
\i supabase/010_cierre_y_sin_cobro.sql
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
\echo '--- D45: evento sin cobro'
select public.panel_guardar_borrador(null, '{"nombre":"Jornada gratuita","fecha":"2027-04-10"}') ->> 'id' as id_gratis \gset
select public.panel_abrir_evento(:'id_gratis', '{"nombre":"Jornada gratuita","fecha":"2027-04-10","unidad":"persona","sinCobro":true,"categorias":[],"campos":[{"id":"nombre","etiqueta":"Nombre y apellido","tipo":"texto"},{"id":"dni","etiqueta":"DNI","tipo":"dni"}],"conceptos":[],"asistencia":{"toma":false}}') ->> 'id' as id_gratis \gset
select :'id_gratis' as abierto, (select x ->> 'sinCobro' from jsonb_array_elements(public.panel_eventos() -> 'eventos') x where x ->> 'id' = :'id_gratis') as sin_cobro;
select public.panel_crear_acceso(:'id_gratis', 'Pedro Gratis', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c_pedro \gset
reset role; set role anon;
select public.activar_acceso(:'c_pedro', 'dispositivo-pedro-01') ->> 'token' as t_pedro \gset
select public.enviar_inscripcion(:'t_pedro', jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000101','creadaEn',now(),'diaCarga',current_date,'datos','{"nombre":"Uno","dni":"30111222"}'::jsonb,'conceptos','[]'::jsonb,'monto',0,'pago','{"medio":"efectivo"}'::jsonb)) ->> 'error' as efectivo_en_gratis;
select public.enviar_inscripcion(:'t_pedro', jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000102','creadaEn',now(),'diaCarga',current_date,'datos','{"nombre":"Dos","dni":"30111223"}'::jsonb,'conceptos','[]'::jsonb,'monto',0,'pago','{"medio":"sin_cobro"}'::jsonb)) ->> 'ok' as sin_cobro_ok;
reset role; set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_corregir_inscripcion('aaaaaaaa-0000-4000-8000-000000000102', '{"nombre":"Dos Corregido"}', 'efectivo', null, null, 'nombre mal') ->> 'ok' as corrige;
reset role; select medio_pago, monto, datos ->> 'nombre' as nombre from public.inscripciones where id = 'aaaaaaaa-0000-4000-8000-000000000102'; set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';

\echo '--- D46: cerrar inscripciones del congreso'
select public.panel_crear_acceso('congreso-prueba', 'Rita Antes', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c_rita \gset
select public.panel_crear_acceso('congreso-prueba', 'Rosa Activa', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c_rosa \gset
reset role; set role anon;
select public.activar_acceso(:'c_rosa', 'dispositivo-rosa-01') ->> 'token' as t_rosa \gset
reset role; set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_cerrar_inscripciones('congreso-prueba', true, 'cupo completo') ->> 'ok' as cierra;
select public.panel_crear_acceso('congreso-prueba', 'Nuevo Cargador', 'cargar', now(), now() + interval '3 hours') ->> 'error' as qr_cargador;
select public.panel_crear_acceso('congreso-prueba', 'Puerta Sigue', 'presentes', now(), now() + interval '3 hours') ->> 'ok' as qr_puerta;
select (x ->> 'inscripcionesCerradas') as en_qr from jsonb_array_elements(public.panel_datos_accesos() -> 'eventos') x where x ->> 'id' = 'congreso-prueba';
reset role; set role anon;
select public.activar_acceso(:'c_rita', 'dispositivo-rita-01') ->> 'error' as activar_rita;
select (public.estado_sesion(:'t_rosa') ->> 'inscripcionesCerradasEn') is not null as rosa_se_entera;
select public.enviar_inscripcion(:'t_rosa', jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000103','creadaEn',now() - interval '30 minutes','diaCarga',current_date,'categoria','adultos','datos','{"nombre":"Antes del cierre","dni":"22111333"}'::jsonb,'conceptos','[]'::jsonb,'monto',7500,'pago','{"medio":"efectivo"}'::jsonb)) ->> 'fueraDeHorario' as antes_fuera;
select public.enviar_inscripcion(:'t_rosa', jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000104','creadaEn',now() + interval '15 minutes','diaCarga',current_date,'categoria','adultos','datos','{"nombre":"Despues del cierre","dni":"22111334"}'::jsonb,'conceptos','[]'::jsonb,'monto',7500,'pago','{"medio":"efectivo"}'::jsonb)) ->> 'fueraDeHorario' as despues_fuera;
select public.enviar_inscripcion(:'t_rosa', jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000105','creadaEn',now(),'diaCarga',current_date,'datos','{"nombre":"Tres"}'::jsonb,'conceptos','[]'::jsonb,'monto',0,'pago','{"medio":"sin_cobro"}'::jsonb)) ->> 'error' as sin_cobro_en_pago;
reset role; set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
\echo '--- reabrir'
select public.panel_cerrar_inscripciones('congreso-prueba', false, 'se liberaron lugares') ->> 'ok' as reabre;
select public.panel_crear_acceso('congreso-prueba', 'Nuevo Cargador', 'cargar', now(), now() + interval '3 hours') ->> 'ok' as qr_cargador_ok;
reset role; set role anon;
select (public.estado_sesion(:'t_rosa') ->> 'inscripcionesCerradasEn') is null as rosa_vuelve;
reset role; set role authenticated;
set request.jwt.claims = '{"email":"consulta@gmail.com"}';
select public.panel_cerrar_inscripciones('congreso-prueba', true) ->> 'error' as sin_rol;
reset role;
select accion, entidad_id, despues from public.auditoria where accion like '%inscripciones' order by id desc limit 2;
