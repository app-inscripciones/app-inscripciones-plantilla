-- Pruebas de 015 (modalidad presencial / virtual / híbrida, R18 y D57). Base con 001 a 015 cargados.
-- Definiciones armadas por la app (src/logica/asistente.js):
--   psql -v hib="$(node herramientas/pruebas-integradas/defmod.mjs hibrido FECHA)" -v vir="$(node defmod.mjs virtual FECHA)" -f supabase/pruebas_015.sql
-- (cupo presencial 4 personas, cierre automático al 100 %; matrícula presencial $5.000 y virtual $2.000)
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/015_modalidad.sql
\i supabase/015_modalidad.sql
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['responsable','organizador','tesorero'], true) ->> 'ok' as organizador;

\echo '--- La base rechaza definiciones mal armadas'
reset role;
select public.problema_definicion(((:'hib')::jsonb - 'campos') || jsonb_build_object('campos', ((:'hib')::jsonb -> 'campos') - 1)) as hibrido_sin_pregunta,
       public.problema_definicion((:'hib')::jsonb || '{"cierrePresencialPct": 80}') as cierre_80,
       public.problema_definicion((:'hib')::jsonb || '{"cupoPresencial": 12.5}') as cupo_decimal,
       public.problema_definicion((:'hib')::jsonb || '{"modalidad": "presencial"}') as presencial_con_pregunta,
       public.problema_definicion((:'vir')::jsonb || '{"asistencia": {"toma": true, "instancias": [{"id":"a","nombre":"Llegada","fecha":"2026-11-20"}]}}') as virtual_con_puerta,
       public.problema_definicion(:'hib') is null as hibrido_ok,
       public.problema_definicion(:'vir') is null as virtual_ok;
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';

\echo '--- Abrir el evento híbrido y cargar desde un celular'
select public.panel_guardar_borrador(null, :'hib') ->> 'id' as borrador \gset
select public.panel_abrir_evento(:'borrador', :'hib') ->> 'id' as ev \gset
select (x ->> 'modalidad') as modalidad, (x ->> 'cupoPresencial') as cupo, (x ->> 'cierrePresencialPct') as cierre
from jsonb_array_elements(public.panel_eventos() -> 'eventos') x where x ->> 'id' = :'ev';
select public.panel_crear_acceso(:'ev', 'Cargadora Híbrida', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c1 \gset
select public.panel_crear_acceso(:'ev', 'Puerta Híbrida', 'presentes', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c2 \gset
reset role; set role anon;
select public.activar_acceso(:'c1', 'dispositivo-hibrido-01') ->> 'token' as t \gset
select public.activar_acceso(:'c2', 'dispositivo-hibrido-02') ->> 'token' as tp \gset
create temporary table if not exists envio (n int, modalidad text, creada timestamptz);
reset role;
grant all on envio to anon;
insert into envio values (1, 'presencial', now()), (2, 'presencial', now()), (3, 'virtual', now()), (4, 'presencial', now());
set role anon;
select n, public.enviar_inscripcion(:'t', jsonb_build_object(
  'id', ('dddddddd-0000-4000-8000-00000000000' || n)::uuid, 'creadaEn', creada, 'diaCarga', current_date,
  'datos', jsonb_build_object('nombre', 'Persona ' || n, 'modalidad', modalidad, 'dni', (30000000 + n)::text, 'telefono', '362400000' || n),
  'conceptos', '[]'::jsonb, 'monto', case when modalidad = 'virtual' then 2000 else 5000 end, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok' as ok
from envio order by n;
select public.estado_sesion(:'t') -> 'presenciales' as celular_antes_de_llenarse;

\echo '--- La 4.ª persona presencial llena el cupo: se cierra solo'
reset role; set role anon;
select public.enviar_inscripcion(:'t', jsonb_build_object(
  'id', 'dddddddd-0000-4000-8000-000000000005'::uuid, 'creadaEn', now() - interval '1 second', 'diaCarga', current_date,
  'datos', '{"nombre":"Persona 5","modalidad":"presencial","dni":"30000005","telefono":"3624000005"}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 5000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok' as quinta;
select (public.estado_sesion(:'t') -> 'presenciales' ->> 'cerradasEn') is not null as celular_se_entera,
       public.estado_sesion(:'t') -> 'presenciales' ->> 'quedan' as quedan;
reset role;
select presenciales, virtuales, cupo, quedan, cerrado_por from (
  select (c ->> 'presenciales')::int presenciales, (c ->> 'virtuales')::int virtuales, (c ->> 'cupo')::int cupo, (c ->> 'quedan')::int quedan, c ->> 'cerradasPor' cerrado_por
  from public.estado_cupo(:'ev') c) x;
select monto, monto_revisar from public.inscripciones where id = 'dddddddd-0000-4000-8000-000000000003';

\echo '--- Una presencial cargada sin internet DESPUÉS del cierre llega igual, marcada «sobre el cupo»'
set role anon;
select public.enviar_inscripcion(:'t', jsonb_build_object(
  'id', 'dddddddd-0000-4000-8000-000000000006'::uuid, 'creadaEn', now() + interval '1 minute', 'diaCarga', current_date,
  'datos', '{"nombre":"Persona 6","modalidad":"presencial","dni":"30000006","telefono":"3624000006"}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 5000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok' as llega;
select public.enviar_inscripcion(:'t', jsonb_build_object(
  'id', 'dddddddd-0000-4000-8000-000000000007'::uuid, 'creadaEn', now() + interval '1 minute', 'diaCarga', current_date,
  'datos', '{"nombre":"Persona 7","modalidad":"virtual","dni":"30000007","telefono":"3624000007"}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 2000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok' as virtual_sigue;
reset role;
select id, sobre_cupo from public.inscripciones where id in ('dddddddd-0000-4000-8000-000000000006', 'dddddddd-0000-4000-8000-000000000007') order by id;
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_resumen(:'ev') ->> 'sobreCupo' as sobre_cupo_en_resumen, public.panel_resumen(:'ev') ->> 'paraRevisar' as para_revisar;
select jsonb_array_length(public.panel_inscripciones(:'ev', '', 'revisar') -> 'inscripciones') as en_para_revisar;
select public.panel_marcar_revisada('dddddddd-0000-4000-8000-000000000006', 'entra de pie') ->> 'ok' as revisada;
reset role; select sobre_cupo from public.inscripciones where id = 'dddddddd-0000-4000-8000-000000000006';

\echo '--- Puerta: solo presenciales'
set role anon;
select count(*) filter (where (x ->> 'virtual')::boolean) as virtuales_marcados, count(*) as total
from jsonb_array_elements(public.lista_puerta(:'tp') -> 'inscripciones') x;
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_presentes(:'ev') ->> 'esperados' as esperados_en_puerta,
       jsonb_array_length(public.panel_presentes(:'ev') -> 'porInstancia' -> 0 -> 'ausentes') as ausentes;

\echo '--- Organizador: ampliar el cupo reabre solo; cerrar y abrir a mano'
select public.panel_presenciales(:'ev', 'cupo', 10, 95) -> 'cupo' ->> 'cerradasEn' is null as reabre_al_ampliar;
select public.panel_presenciales(:'ev', 'cerrar', null, null, 'decisión del pastor') -> 'cupo' ->> 'cerradasPor' as cerrado_a_mano;
select public.panel_presenciales(:'ev', 'cupo', 20, 100) -> 'cupo' ->> 'cerradasEn' is not null as cierre_manual_no_se_reabre;
select public.panel_presenciales(:'ev', 'abrir') -> 'cupo' ->> 'cerradasEn' is null as abierto;
select public.panel_presenciales(:'ev', 'cupo', 0, 100) ->> 'error' as cupo_cero;
select public.panel_presenciales('congreso-prueba', 'cerrar') ->> 'error' as no_hibrido;
reset role;
select count(*) as auditoria from public.auditoria where accion like '%presenciales' and entidad_id = :'ev';

\echo '--- Un evento presencial común no se ve afectado'
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_resumen('congreso-prueba') -> 'modalidad' ->> 'modalidad' as congreso;
reset role;
