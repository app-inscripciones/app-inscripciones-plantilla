-- Pruebas de 008 (después de pruebas_etapa4b.sql en la misma base).
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/008_institucion.sql
\i supabase/008_institucion.sql
set role anon;
select public.institucion_publica() as sin_configurar;
reset role;
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
\echo '--- institución'
select public.panel_guardar_institucion('Iglesia Central', 'Inscripciones', '#1f4e79', '#F6F7F9', null, 'Datos de salud solo para la cocina.', 'secretaria@iglesia.org')->>'ok' as guarda;
select public.panel_guardar_institucion('Iglesia Central', 'Inscripciones', 'rojo', '#F6F7F9', null, null, null)->>'error' as color_mal;
select public.panel_guardar_institucion('X', 'Inscripciones', '#000000', '#FFFFFF', null, null, null)->>'error' as nombre_corto;
reset role; set role anon;
select public.institucion_publica() - 'actualizadaEn' as publica;
reset role; set role authenticated;
\echo '--- momentos de asistencia (Llegada tiene marcas en esta base? se quitó; marcamos de nuevo)'
reset role;
insert into public.asistencias (id, evento_id, inscripcion_id, instancia, marcada_en, marcado_por)
  values ('eeeeeeee-0000-4000-8000-000000000009','congreso-prueba','11111111-1111-4111-8111-111111111111','llegada',now(),'Juan') on conflict do nothing;
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_instancias('congreso-prueba', '[{"id":"llegada","nombre":"Llegada","fecha":"2026-11-01"},{"nombre":"Cena","fecha":"2026-11-01","turno":"noche"}]')->'instancias' as agrega;
select public.panel_guardar_instancias('congreso-prueba', '[{"id":"llegada","nombre":"Entrada","fecha":"2026-11-01"}]')->>'error' as renombrar_con_marcas;
select public.panel_guardar_instancias('congreso-prueba', '[{"nombre":"Otra","fecha":"2026-11-02"}]')->>'error' as borrar_con_marcas;
reset role; select jsonb_array_length(public.config_asistencia('congreso-prueba')->'instancias') as cantidad; set role authenticated;
set request.jwt.claims = '{"email":"intruso@mail.com"}';
select public.panel_guardar_institucion('Y Y', 'A', '#000000', '#FFFFFF', null, null, null)->>'error' as intruso;
reset role;
