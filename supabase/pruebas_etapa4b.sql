-- Pruebas de la Etapa 4B (base vacía). Uso: psql -f supabase/pruebas_etapa4b.sql
\set ON_ERROR_STOP on
set client_min_messages = warning;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists extensions;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant usage on schema public to anon, authenticated;
\i supabase/001_base.sql
\i supabase/002_eventos_modelo.sql
\i supabase/003_accesos_qr.sql
\i supabase/004_usuarios.sql
\i supabase/005_panel_control.sql
\i supabase/006_gestion.sql
\i supabase/007_presentes.sql
\i supabase/007_presentes.sql
select public.fijar_clave_organizador('clave-de-prueba-larga');
select public.alta_primer_responsable('carlos@gmail.com', 'Carlos');

set role anon;
select (public.org_crear_acceso('clave-de-prueba-larga','congreso-prueba','Ana','cargar',now()-interval '1 hour',now()+interval '5 hours'))->>'codigo' as c_ana \gset
select (public.org_crear_acceso('clave-de-prueba-larga','congreso-prueba','Juan','presentes',now()-interval '1 hour',now()+interval '5 hours'))->>'codigo' as c_juan \gset
select (public.org_crear_acceso('clave-de-prueba-larga','congreso-prueba','Lía','presentes',now()-interval '1 hour',now()+interval '5 hours'))->>'codigo' as c_lia \gset
select public.activar_acceso(:'c_ana','disp-ana-0001')->>'token' as t_ana \gset
select public.activar_acceso(:'c_juan','disp-juan-001')->>'token' as t_juan \gset
select public.activar_acceso(:'c_lia','disp-lia-0001')->>'token' as t_lia \gset

\echo '--- 1. Ana inscribe a dos personas; una con «Ya está presente»'
select public.enviar_inscripcion_y_presente(:'t_ana', jsonb_build_object('id','11111111-1111-4111-8111-111111111111','creadaEn',now(),'diaCarga',current_date,
  'categoria','jovenes','datos','{"nombre":"Laura Díaz","dni":"35111222","telefono":"3624000111","gluten":"no"}'::jsonb,'conceptos','[]'::jsonb,'monto',3500,'pago','{"medio":"efectivo"}'::jsonb,
  'presente', jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000001','instancia','llegada')))->>'ok' as laura;
select public.enviar_inscripcion_y_presente(:'t_ana', jsonb_build_object('id','22222222-2222-4222-8222-222222222222','creadaEn',now(),'diaCarga',current_date,
  'categoria','adultos','datos','{"nombre":"Mario Gómez","dni":"20111222","iglesia":"Bethel"}'::jsonb,'conceptos','[]'::jsonb,'monto',3750,'pago','{"medio":"efectivo"}'::jsonb))->>'ok' as mario;

\echo '--- 2. la lista de la puerta trae solo lo necesario (sin teléfono, dinero ni salud)'
select x->'datos' as datos, x->>'procedencia' as procedencia, x->>'categoria' as cat
from jsonb_array_elements(public.lista_puerta(:'t_juan')->'inscripciones') x order by x->>'n';
select jsonb_array_length(public.lista_puerta(:'t_juan')->'marcas') as marcas_iniciales;
select public.lista_puerta(:'t_ana')->>'error' as cargador_no_puede;

\echo '--- 3. Juan y Lía marcan a Mario casi a la vez: vale la hora más temprana'
select public.enviar_marcas(:'t_lia', jsonb_build_array(jsonb_build_object('id','bbbbbbbb-0000-4000-8000-000000000002','inscripcionId','22222222-2222-4222-8222-222222222222','instancia','llegada','marcadaEn', now())))->'resultados'->0->>'resultado' as lia;
select public.enviar_marcas(:'t_juan', jsonb_build_array(jsonb_build_object('id','cccccccc-0000-4000-8000-000000000003','inscripcionId','22222222-2222-4222-8222-222222222222','instancia','llegada','marcadaEn', now() - interval '2 minutes')))->'resultados'->0->>'resultado' as juan_antes;
select public.enviar_marcas(:'t_juan', jsonb_build_array(jsonb_build_object('id','cccccccc-0000-4000-8000-000000000003','inscripcionId','22222222-2222-4222-8222-222222222222','instancia','llegada','marcadaEn', now())))->'resultados'->0->>'resultado' as repetida;
reset role;
select marcado_por, estado from public.asistencias where inscripcion_id = '22222222-2222-4222-8222-222222222222' order by marcada_en;
set role anon;
\echo '--- 4. deshacer: Lía no puede deshacer la de Juan; Juan sí'
select public.enviar_marcas(:'t_lia', jsonb_build_array(jsonb_build_object('id','cccccccc-0000-4000-8000-000000000003','estado','deshecha')))->'resultados'->0->>'resultado' as lia_deshace;
reset role; select count(*) as sigue_presente from public.asistencias where id='cccccccc-0000-4000-8000-000000000003' and estado='presente'; set role anon;
select public.enviar_marcas(:'t_juan', jsonb_build_array(jsonb_build_object('id','cccccccc-0000-4000-8000-000000000003','estado','deshecha')))->'resultados'->0->>'resultado' as juan_deshace;
\echo '--- 5. instancia inexistente e inscripción de otro evento'
select public.enviar_marcas(:'t_juan', jsonb_build_array(jsonb_build_object('id','dddddddd-0000-4000-8000-000000000004','inscripcionId','22222222-2222-4222-8222-222222222222','instancia','domingo','marcadaEn', now())))->'resultados'->0->>'resultado' as instancia_mal;
\echo '--- 6. lo que cambió desde hace un minuto (sincronización entre celulares)'
select jsonb_array_length(l->'marcas') as marcas_cambiadas, jsonb_array_length(l->'inscripciones') as inscripciones_cambiadas
from (select public.lista_puerta(:'t_lia', now() + interval '1 hour') l) x;
select jsonb_array_length(l->'marcas') as marcas_desde_antes from (select public.lista_puerta(:'t_lia', now() - interval '1 minute') l) x;
reset role;

\echo '--- 7. panel: presentes por instancia; organizador quita una marca'
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('carlos@gmail.com','Carlos',array['responsable','organizador'],true)->>'ok' as roles;
select p->'esperados' as esperados, p->'porInstancia'->0->'presentes' as presentes, p->'porInstancia'->0->'porCategoria' as por_cat
from (select public.panel_presentes('congreso-prueba') p) x;
select public.panel_quitar_presente('aaaaaaaa-0000-4000-8000-000000000001', 'No vino, se cargó mal')->>'ok' as quita;
select public.panel_presentes('congreso-prueba')->'porInstancia'->0->'presentes' as presentes_despues;
select jsonb_array_length(public.panel_exportar('congreso-prueba')->'presentes'->'marcas') as marcas_en_excel;
\echo '--- 8. una inscripción anulada no cuenta como presente'
select public.panel_anular_inscripcion('22222222-2222-4222-8222-222222222222','Prueba de anulación')->>'ok' as anula;
select public.panel_presentes('congreso-prueba')->'porInstancia'->0->'presentes' as presentes_tras_anular;
\echo '--- 9. la app no lee la tabla (error esperado)'
\set ON_ERROR_STOP off
select count(*) from public.asistencias;
reset role;
