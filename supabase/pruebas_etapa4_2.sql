-- Pruebas de la Etapa 4.2 (después de pruebas_etapa4.sql en la misma base).
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/005_panel_control.sql
\i supabase/005_panel_control.sql
-- datos de prueba (como si hubieran llegado de los celulares)
insert into public.inscripciones (id, evento_id, cargador, creada_en_local, dia_carga, categoria, datos, conceptos, monto, medio_pago, banco, ultimos6, estado, fuera_de_horario) values
 (gen_random_uuid(),'congreso-prueba','Ana Pérez',now(),'2026-10-12','jovenes','{"nombre":"Laura Díaz","dni":"35111222"}','[]',3500,'efectivo',null,null,'activa',false),
 (gen_random_uuid(),'congreso-prueba','Ana Pérez',now(),'2026-10-12','adultos','{"nombre":"Mario Gómez","dni":"20111222"}','[]',3750,'transferencia','MP','A1B2C3','activa',false),
 (gen_random_uuid(),'congreso-prueba','Juan Ríos',now(),'2026-10-13','jovenes','{"nombre":"Sofía Núñez","dni":"40111222"}','[]',6500,'efectivo',null,null,'posible_duplicado',false),
 (gen_random_uuid(),'congreso-prueba','Juan Ríos',now(),'2026-10-13','jovenes','{"nombre":"Pedro Paz","dni":"41111222"}','[]',9999,'efectivo',null,null,'anulada',false),
 (gen_random_uuid(),'congreso-prueba','Juan Ríos',now(),'2026-10-13','adultos','{"nombre":"Tardío","dni":"42111222"}','[]',1000,'terminal',null,null,'activa',true);
insert into public.rendiciones (evento_id, cargador, monto, recibido_por) values ('congreso-prueba','Ana Pérez',2000,'beto@mail.com');
insert into public.rendiciones (evento_id, cargador, monto, recibido_por, anulada) values ('congreso-prueba','Ana Pérez',500,'beto@mail.com',true);

set role authenticated;
\echo '--- 1. sin rol no ve nada'
set request.jwt.claims = '{"email":"intruso@mail.com"}';
select public.panel_resumen('congreso-prueba')->>'error' as intruso;
\echo '--- 2. Ana (organizadora) ve el resumen'
set request.jwt.claims = '{"email":"ana@mail.com"}';
select r->'inscriptos' as inscriptos, r->'anuladas' as anuladas, r->'posiblesDuplicados' as dup, r->'fueraDeHorario' as fuera, r->'dinero' as dinero
from (select public.panel_resumen('congreso-prueba') r) x;
select jsonb_pretty(public.panel_resumen('congreso-prueba')->'porCargador') as por_cargador;
select public.panel_resumen('congreso-prueba')->'porCategoria' as por_categoria, public.panel_resumen('congreso-prueba')->'porDia' as por_dia;
\echo '--- 3. búsqueda: sin acentos, por DNI parcial, por número de orden, filtros'
select jsonb_path_query_array(public.panel_inscripciones('congreso-prueba','sofia'), '$.inscripciones[*].datos.nombre') as busca_sofia,
       jsonb_path_query_array(public.panel_inscripciones('congreso-prueba','20.111'), '$.inscripciones[*].datos.nombre') as busca_dni,
       jsonb_path_query_array(public.panel_inscripciones('congreso-prueba','1'), '$.inscripciones[*].numeroOrden') as busca_nro1;
select jsonb_path_query_array(public.panel_inscripciones('congreso-prueba','', 'revisar'), '$.inscripciones[*].datos.nombre') as revisar,
       jsonb_path_query_array(public.panel_inscripciones('congreso-prueba','', 'anuladas'), '$.inscripciones[*].datos.nombre') as anuladas,
       jsonb_array_length(public.panel_inscripciones('congreso-prueba')->'inscripciones') as todas;
select public.panel_eventos()->'eventos'->0->>'nombre' as primer_evento;
\echo '--- 4. no se leen tablas directamente (error esperado)'
\set ON_ERROR_STOP off
select count(*) from public.rendiciones;
reset role;
