-- Pruebas de las Etapas 4.3 a 4.5 (después de pruebas_etapa4.sql y pruebas_etapa4_2.sql en la misma base).
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/006_gestion.sql
\i supabase/006_gestion.sql
-- Beto vuelve a estar activo como tesorero
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('beto@mail.com', 'Beto Ríos', array['tesorero'], true)->>'ok' as beto_activo;

\echo '--- 1. rendiciones: Ana (organizadora) no puede; Beto (tesorero) sí'
set request.jwt.claims = '{"email":"ana@mail.com"}';
select public.panel_registrar_rendicion('congreso-prueba', 'Juan Ríos', 1000)->>'error' as ana_rinde;
set request.jwt.claims = '{"email":"beto@mail.com"}';
select public.panel_registrar_rendicion('congreso-prueba', 'Juan Ríos', 0)->>'error' as monto_cero;
select public.panel_registrar_rendicion('congreso-prueba', 'Juan Ríos', 4000, 'Primera entrega') - 'id' as rinde_juan;
select (public.panel_rendiciones('congreso-prueba')->'rendiciones'->0) - 'id' - 'entregadoEn' as ultima_rendicion;
select public.panel_anular_rendicion((public.panel_rendiciones('congreso-prueba')->'rendiciones'->0->>'id')::uuid, '')->>'error' as sin_motivo;
select public.panel_anular_rendicion((public.panel_rendiciones('congreso-prueba')->'rendiciones'->0->>'id')::uuid, 'Monto mal tipeado')->>'ok' as anula;
select jsonb_path_query(public.panel_resumen('congreso-prueba'), '$.porCargador[*] ? (@.cargador == "Juan Ríos").aRendir') as juan_a_rendir;

\echo '--- 2. correcciones (Ana, organizadora): datos y medio de pago, nunca el monto'
set request.jwt.claims = '{"email":"ana@mail.com"}';
select (public.panel_inscripciones('congreso-prueba', 'Laura')->'inscripciones'->0->>'id') as id_laura \gset
select public.panel_corregir_inscripcion(:'id_laura', '{"nombre":"Laura Díaz Paz","inventado":"x"}', 'transferencia', 'BNA', 'ab12', 'Cambió a transferencia')->>'error' as transf_incompleta;
select public.panel_corregir_inscripcion(:'id_laura', '{"nombre":"Laura Díaz Paz","inventado":"x","monto":1}', 'transferencia', 'BNA', 'ab12cd', 'Pagó por transferencia') ->>'ok' as corrige;
select i->'datos' as datos, i->>'monto' as monto, i->>'medioPago' as medio, i->>'ultimos6' as ult
from (select public.panel_inscripciones('congreso-prueba', 'Laura')->'inscripciones'->0 i) x;
set request.jwt.claims = '{"email":"beto@mail.com"}';
select public.panel_corregir_inscripcion(:'id_laura', '{}', 'efectivo', null, null, 'intento')->>'error' as beto_corrige;

\echo '--- 3. revisión de posibles duplicados y fuera de horario; anulación'
set request.jwt.claims = '{"email":"ana@mail.com"}';
select (public.panel_inscripciones('congreso-prueba', 'Sofia')->'inscripciones'->0->>'id') as id_sofia \gset
select (public.panel_inscripciones('congreso-prueba', 'Tardio')->'inscripciones'->0->>'id') as id_tardio \gset
select public.panel_marcar_revisada(:'id_sofia', 'Son hermanas, no es la misma persona')->>'ok' as sofia_ok;
select public.panel_anular_inscripcion(:'id_tardio', 'x')->>'error' as motivo_corto;
select public.panel_anular_inscripcion(:'id_tardio', 'Cargada después de cerrar, no vino') as anula_tardio;
select r->'posiblesDuplicados' as dup, r->'fueraDeHorario' as fuera, r->'inscriptos' as inscriptos, r->'dinero'->'terminal' as terminal
from (select public.panel_resumen('congreso-prueba') r) x;
select public.panel_anular_inscripcion(:'id_tardio', 'otra vez')->>'error' as ya_anulada;

\echo '--- 4. historial de una inscripción'
select jsonb_path_query_array(public.panel_historial('inscripcion', :'id_laura'), '$.cambios[*].accion') as historial_laura,
       public.panel_historial('inscripcion', :'id_laura')->'cambios'->0->>'quien' as quien;

\echo '--- 5. exportación para el Excel'
select jsonb_array_length(e->'inscripciones') as inscripciones, jsonb_array_length(e->'rendiciones') as rendiciones,
       e->'resumen'->'dinero'->'total' as total
from (select public.panel_exportar('congreso-prueba') e) x;
set request.jwt.claims = '{"email":"intruso@mail.com"}';
select public.panel_exportar('congreso-prueba')->>'error' as intruso_excel;
reset role;
