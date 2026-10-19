-- Pruebas de 018 (inscripción por grupo, R19 y D61). Base con 001 a 018 cargados.
-- Definiciones armadas por la app (src/logica/asistente.js):
--   D=herramientas/pruebas-integradas/defgrupo.mjs; F=$(date -d '+30 days' +%F)
--   psql -v tor="$(node $D torneo $F)" -v fam="$(node $D familias $F)" -v hib="$(node $D hibrido $F)" -f supabase/pruebas_018.sql
-- Cada control que falla corta la prueba con «FALLÓ: …».
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/018_grupos.sql
\i supabase/018_grupos.sql
create or replace function pg_temp.ok(c boolean, msg text) returns text language plpgsql as $$
begin if c is not true then raise exception 'FALLÓ: %', msg; end if; return 'ok · ' || msg; end $$;

\echo '--- La base rechaza definiciones de grupo mal armadas'
select pg_temp.ok(public.problema_definicion(:'tor') is null, 'torneo bien armado'),
       pg_temp.ok(public.problema_definicion(:'fam') is null, 'familias bien armado'),
       pg_temp.ok(public.problema_definicion(:'hib') is null, 'torneo híbrido bien armado');
select pg_temp.ok(public.problema_definicion((:'tor')::jsonb - 'grupo') = 'datos del grupo', 'sin datos del grupo'),
       pg_temp.ok(public.problema_definicion(jsonb_set(:'tor', '{grupo,min}', '7')) = 'integrantes del grupo', 'mínimo mayor que el máximo'),
       pg_temp.ok(public.problema_definicion(jsonb_set(:'tor', '{grupo,max}', '51')) = 'integrantes del grupo', 'más de 50'),
       pg_temp.ok(public.problema_definicion(jsonb_set(:'tor', '{grupo,cobro}', '"otro"')) = 'forma de cobro del grupo', 'forma de cobro'),
       pg_temp.ok(public.problema_definicion(jsonb_set(:'fam', '{grupo,cobro}', '"grupo"')) = 'precio por categoría con cobro por grupo', 'precio por categoría con cobro por grupo'),
       pg_temp.ok(public.problema_definicion(jsonb_set(jsonb_set(:'tor', '{conceptos,0,aplicaSi}', '{"campo":"dni","igual":"x"}'), '{grupo,cobro}', '"grupo"')) = 'cobro por grupo que depende de un integrante', 'cobro por grupo que depende de un integrante'),
       pg_temp.ok(public.problema_definicion(jsonb_set(:'tor', '{unidad}', '"persona"')) is not null, 'preguntas de grupo en un evento por persona');

set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['responsable','organizador','tesorero'], true) ->> 'ok' as organizador;

\echo '--- Abrir los eventos (el borrador guarda la unidad «grupo»)'
select public.panel_guardar_borrador(null, :'tor') ->> 'id' as b1 \gset
reset role;
select pg_temp.ok((select unidad from public.eventos where id = :'b1') = 'grupo', 'el borrador queda con unidad grupo');
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_abrir_evento(:'b1', :'tor') ->> 'id' as tor \gset
select public.panel_guardar_borrador(null, :'fam') ->> 'id' as b2 \gset
select public.panel_abrir_evento(:'b2', :'fam') ->> 'id' as fam \gset
select public.panel_guardar_borrador(null, :'hib') ->> 'id' as b3 \gset
select public.panel_abrir_evento(:'b3', :'hib') ->> 'id' as hib \gset
select pg_temp.ok((select count(*) from jsonb_array_elements(public.panel_eventos() -> 'eventos') x
                   where x ->> 'id' in (:'tor', :'fam', :'hib') and x ->> 'unidad' = 'grupo' and x -> 'grupo' ? 'cobro') = 3, 'el panel ve los tres eventos por grupo');
select public.panel_crear_acceso(:'tor', 'Cargador Torneo', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c1 \gset
select public.panel_crear_acceso(:'fam', 'Cargadora Familias', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c2 \gset
select public.panel_crear_acceso(:'hib', 'Cargador Híbrido', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c3 \gset
select public.panel_crear_acceso(:'tor', 'Puerta Torneo', 'presentes', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as p1 \gset
select public.panel_crear_acceso(:'fam', 'Puerta Familias', 'presentes', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as p2 \gset
reset role; set role anon;
select public.activar_acceso(:'c1', 'disp-grupo-01') ->> 'token' as t1 \gset
select public.activar_acceso(:'c2', 'disp-grupo-02') ->> 'token' as t2 \gset
select public.activar_acceso(:'c3', 'disp-grupo-03') ->> 'token' as t3 \gset
select public.activar_acceso(:'p1', 'disp-grupo-04') ->> 'token' as tp1 \gset
select public.activar_acceso(:'p2', 'disp-grupo-05') ->> 'token' as tp2 \gset
reset role;
create temporary table equipos as
select n, ('eeeeeeee-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid as id,
       jsonb_build_object('nombre_grupo', 'Equipo ' || n, 'telefono', '36240000' || lpad(n::text, 2, '0'),
         'integrantes', (select jsonb_agg(jsonb_build_object('id', 'i' || k, 'nombre', 'Jugador ' || n || '-' || k, 'dni', (40000000 + n * 100 + k)::text)
                                          || case when k = 1 then '{"responsable":true}'::jsonb else '{}'::jsonb end order by k)
                         from generate_series(1, case when n = 2 then 5 else 6 end) k)) as datos
from generate_series(1, 3) n;
grant select on equipos to anon;

\echo '--- Torneo: un precio por equipo, personas = integrantes'
set role anon;
select n, public.enviar_inscripcion(:'t1', jsonb_build_object('id', id, 'creadaEn', now(), 'diaCarga', current_date, 'datos', datos,
  'conceptos', '[]'::jsonb, 'monto', 50000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok' as ok from equipos where n <= 2 order by n;
reset role;
select pg_temp.ok((select array_agg(personas order by numero_orden) from public.inscripciones where evento_id = :'tor') = array[6, 5], 'personas 6 y 5'),
       pg_temp.ok((select bool_and(not monto_revisar and monto_esperado = 50000 and categoria is null) from public.inscripciones where evento_id = :'tor'), 'monto controlado por equipo');
set role anon;
select pg_temp.ok((public.enviar_inscripcion(:'t1', jsonb_build_object('id', id, 'creadaEn', now(), 'diaCarga', current_date, 'datos', datos,
  'conceptos', '[]'::jsonb, 'monto', 50000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'repetida')::boolean, 'reenvío sin duplicar') from equipos where n = 1;
-- Otro equipo con un jugador que ya está en el equipo 1: «posible duplicado».
select pg_temp.ok((public.enviar_inscripcion(:'t1', jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-000000000099', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', jsonb_build_object('nombre_grupo', 'Equipo repetido', 'telefono', '3624999999', 'integrantes',
     jsonb_build_array('{"id":"i1","responsable":true,"nombre":"Nuevo","dni":"49999999"}'::jsonb, '{"id":"i2","nombre":"Repetido","dni":"40.000.103"}'::jsonb,
       '{"id":"i3","nombre":"C","dni":"49999998"}'::jsonb, '{"id":"i4","nombre":"D","dni":"49999997"}'::jsonb, '{"id":"i5","nombre":"E","dni":"49999996"}'::jsonb)),
  'conceptos', '[]'::jsonb, 'monto', 50000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'posibleDuplicado')::boolean, 'DNI de un integrante ya inscripto en otro equipo');
-- Sin lista de integrantes, o con ids repetidos: no se acepta.
select pg_temp.ok(public.enviar_inscripcion(:'t1', jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-000000000098', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Sin lista"}'::jsonb, 'conceptos', '[]'::jsonb, 'monto', 50000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'error' = 'datos_invalidos', 'grupo sin integrantes'),
       pg_temp.ok(public.enviar_inscripcion(:'t1', jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-000000000097', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Ids","integrantes":[{"id":"i1","nombre":"A"},{"id":"i1","nombre":"B"}]}'::jsonb, 'conceptos', '[]'::jsonb, 'monto', 50000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'error' = 'datos_invalidos', 'ids de integrantes repetidos');

\echo '--- Familias: según cada integrante (categoría) + transporte para cada uno'
select pg_temp.ok((public.enviar_inscripcion(:'t2', jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000001', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Pérez","telefono":"3624111222","transporte":"si","integrantes":[
     {"id":"i1","responsable":true,"nombre":"Ana Pérez","dni":"30111222","edad":"40","categoria":"adultos"},
     {"id":"i2","nombre":"Juan Pérez","dni":"30111223","edad":"38","categoria":"adultos"},
     {"id":"i3","nombre":"Lola Pérez","edad":"7","categoria":"ninos"}]}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 15000, 'pago', '{"medio":"terminal"}'::jsonb)) ->> 'montoARevisar')::boolean = false, 'familia: 5.000 + 5.000 + 2.000 + 3 × 1.000 = 15.000');
select pg_temp.ok((public.enviar_inscripcion(:'t2', jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000002', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Gómez","telefono":"3624333444","transporte":"no","integrantes":[
     {"id":"i1","responsable":true,"nombre":"Rosa Gómez","edad":"35","categoria":"adultos"},
     {"id":"i2","nombre":"Tomi Gómez","edad":"5","categoria":"ninos"}]}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 5000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'montoARevisar')::boolean, 'familia con monto equivocado: para revisar');
reset role;
select pg_temp.ok((select monto_esperado from public.inscripciones where id = 'ffffffff-0000-4000-8000-000000000002') = 7000, 'monto esperado 7.000'),
       pg_temp.ok((select categoria is null and personas = 3 from public.inscripciones where id = 'ffffffff-0000-4000-8000-000000000001'), 'categoría por integrante, 3 personas');

\echo '--- Panel: inscripciones y personas; categorías de los integrantes'
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select pg_temp.ok((r ->> 'inscriptos')::int = 3 and (r ->> 'personas')::int = 16, 'torneo: 3 equipos, 16 personas'),
       pg_temp.ok((r -> 'porCargador' -> 0 ->> 'personas')::int = 16, 'personas por cargador')
from public.panel_resumen(:'tor') r;
select pg_temp.ok((r ->> 'inscriptos')::int = 2 and (r ->> 'personas')::int = 5, 'familias: 2 familias, 5 personas'),
       pg_temp.ok(r -> 'porCategoria' = '[{"categoria":"adultos","cantidad":3},{"categoria":"ninos","cantidad":2}]'::jsonb, 'categorías contadas por integrante')
from public.panel_resumen(:'fam') r;
select pg_temp.ok(jsonb_array_length(public.panel_inscripciones(:'fam', 'lola') -> 'inscripciones') = 1, 'buscar por el nombre de un integrante'),
       pg_temp.ok(jsonb_array_length(public.panel_inscripciones(:'tor', '40000203') -> 'inscripciones') = 1, 'buscar por el DNI de un integrante'),
       pg_temp.ok(jsonb_array_length(public.panel_inscripciones(:'tor', 'telefono') -> 'inscripciones') = 0, 'no encuentra por el nombre de un dato');

\echo '--- Puerta: integrantes con lo justo para reconocerlos'
reset role; set role anon;
select pg_temp.ok((select x -> 'integrantes' -> 2 from jsonb_array_elements(public.lista_puerta(:'tp2') -> 'inscripciones') x where x -> 'datos' ->> 'nombre_grupo' = 'Pérez')
                  = '{"id":"i3","nombre":"Lola Pérez","categoria":"ninos"}'::jsonb, 'integrante sin edad ni otros datos'),
       pg_temp.ok((select (x ->> 'personas')::int from jsonb_array_elements(public.lista_puerta(:'tp2') -> 'inscripciones') x where x -> 'datos' ->> 'nombre_grupo' = 'Pérez') = 3, 'personas en la lista'),
       pg_temp.ok(public.lista_puerta(:'tp2') -> 'asistencia' ->> 'modoPareja' = 'individual', 'familias: cada integrante por separado'),
       pg_temp.ok(public.lista_puerta(:'tp1') -> 'asistencia' ->> 'modoPareja' = 'pareja', 'torneo: el equipo junto');
select public.lista_puerta(:'tp2') -> 'asistencia' -> 'instancias' -> 0 ->> 'id' as inst2 \gset
select public.lista_puerta(:'tp1') -> 'asistencia' -> 'instancias' -> 0 ->> 'id' as inst1 \gset
select r -> 'resultados' as marcas_familia from public.enviar_marcas(:'tp2', jsonb_build_array(
  jsonb_build_object('id', 'abababab-0000-4000-8000-000000000001', 'inscripcionId', 'ffffffff-0000-4000-8000-000000000001', 'instancia', :'inst2', 'persona', 'i1', 'marcadaEn', now()),
  jsonb_build_object('id', 'abababab-0000-4000-8000-000000000002', 'inscripcionId', 'ffffffff-0000-4000-8000-000000000001', 'instancia', :'inst2', 'persona', 'i3', 'marcadaEn', now()),
  jsonb_build_object('id', 'abababab-0000-4000-8000-000000000003', 'inscripcionId', 'ffffffff-0000-4000-8000-000000000001', 'instancia', :'inst2', 'persona', 'i9', 'marcadaEn', now()),
  jsonb_build_object('id', 'abababab-0000-4000-8000-000000000004', 'inscripcionId', 'ffffffff-0000-4000-8000-000000000001', 'instancia', :'inst2', 'persona', '', 'marcadaEn', now()))) r \gset
select pg_temp.ok(:'marcas_familia'::jsonb @> '[{"resultado":"ok"},{"resultado":"ok"},{"resultado":"datos_invalidos"},{"resultado":"datos_invalidos"}]'::jsonb
                  and (select array_agg(x ->> 'resultado') from jsonb_array_elements(:'marcas_familia'::jsonb) x) = array['ok','ok','datos_invalidos','datos_invalidos'],
                  'marca por integrante: i1 y i3 sí; i9 (no existe) y sin integrante, no');
select pg_temp.ok(public.enviar_marcas(:'tp1', jsonb_build_array(jsonb_build_object('id', 'abababab-0000-4000-8000-000000000005',
  'inscripcionId', 'eeeeeeee-0000-4000-8000-000000000001', 'instancia', :'inst1', 'persona', 'i2', 'marcadaEn', now()))) -> 'resultados' -> 0 ->> 'resultado' = 'ok', 'torneo: el equipo junto');
reset role;
select pg_temp.ok((select persona from public.asistencias where id = 'abababab-0000-4000-8000-000000000005') = '', 'en modo junto se guarda sin integrante');
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select pg_temp.ok((p ->> 'esperados')::int = 5 and (p -> 'porInstancia' -> 0 ->> 'presentes')::int = 2, 'familias: se esperan 5 personas, 2 presentes'),
       pg_temp.ok(p -> 'porInstancia' -> 0 -> 'porCategoria' = '{"adultos":1,"ninos":1}'::jsonb, 'presentes por categoría del integrante')
from public.panel_presentes(:'fam') p;
select pg_temp.ok((p ->> 'esperados')::int = 3 and (p -> 'porInstancia' -> 0 ->> 'presentes')::int = 1, 'torneo: se esperan 3 equipos, 1 presente'),
       pg_temp.ok(p -> 'porInstancia' -> 0 -> 'ausentes' -> 0 ->> 'nombre' = 'Equipo 2', 'ausente con el nombre del equipo')
from public.panel_presentes(:'tor') p;

\echo '--- «Ya está presente» al inscribir una familia que se marca por integrante'
reset role; set role anon;
select pg_temp.ok((public.enviar_inscripcion_y_presente(:'t2', jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000003', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Sosa","telefono":"3624555666","transporte":"no","integrantes":[
     {"id":"i1","responsable":true,"nombre":"Luis Sosa","edad":"50","categoria":"adultos"},{"id":"i2","nombre":"Mia Sosa","edad":"10","categoria":"ninos"}]}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 7000, 'pago', '{"medio":"efectivo"}'::jsonb,
  'presente', jsonb_build_object('id', 'cdcdcdcd-0000-4000-8000-000000000001', 'instancia', :'inst2'))) ->> 'ok')::boolean, 'inscripción con presente');
reset role;
select pg_temp.ok((select array_agg(persona order by persona) from public.asistencias where inscripcion_id = 'ffffffff-0000-4000-8000-000000000003' and estado = 'presente') = array['i1','i2'], 'quedan presentes los dos integrantes');

\echo '--- Correcciones del Organizador (D61, alternativa A)'
reset role;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
-- Torneo (precio por equipo): quitar un jugador (6 → 5) se puede; dejarlo en 4, no.
select pg_temp.ok(public.panel_corregir_inscripcion('eeeeeeee-0000-4000-8000-000000000001',
  jsonb_build_object('integrantes', (select jsonb_agg(x) from jsonb_array_elements((select datos -> 'integrantes' from public.inscripciones where id = 'eeeeeeee-0000-4000-8000-000000000001')) x where x ->> 'id' <> 'i6')),
  'efectivo', null, null, 'Se bajó un jugador') ->> 'ok' = 'true', 'quitar un jugador dentro del mínimo');
select pg_temp.ok((select personas from public.inscripciones where id = 'eeeeeeee-0000-4000-8000-000000000001') = 5, 'personas se actualiza a 5');
reset role;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select pg_temp.ok(public.panel_corregir_inscripcion('eeeeeeee-0000-4000-8000-000000000001',
  jsonb_build_object('integrantes', (select jsonb_agg(x) from jsonb_array_elements((select datos -> 'integrantes' from public.inscripciones where id = 'eeeeeeee-0000-4000-8000-000000000001')) x where x ->> 'id' <> 'i5')),
  'efectivo', null, null, 'Otro más') ->> 'error' = 'integrantes_fuera_de_rango', 'no puede quedar con 4');
select pg_temp.ok(public.panel_corregir_inscripcion('eeeeeeee-0000-4000-8000-000000000001',
  jsonb_build_object('integrantes', (select jsonb_agg(x - 'responsable') from jsonb_array_elements((select datos -> 'integrantes' from public.inscripciones where id = 'eeeeeeee-0000-4000-8000-000000000001')) x)),
  'efectivo', null, null, 'Sin responsable') ->> 'error' = 'falta_responsable', 'tiene que haber un responsable');
-- Familia (según cada integrante): reemplazar a un integrante sí; agregar a alguien cambia el monto: no.
select pg_temp.ok(public.panel_corregir_inscripcion('ffffffff-0000-4000-8000-000000000001',
  jsonb_build_object('integrantes', (select jsonb_agg(case when x ->> 'id' = 'i2' then x || '{"nombre":"Juan Carlos Pérez"}' else x end)
     from jsonb_array_elements((select datos -> 'integrantes' from public.inscripciones where id = 'ffffffff-0000-4000-8000-000000000001')) x)),
  'terminal', null, null, 'Nombre completo') ->> 'ok' = 'true', 'reemplazar el nombre de un integrante');
select pg_temp.ok(public.panel_corregir_inscripcion('ffffffff-0000-4000-8000-000000000001',
  jsonb_build_object('integrantes', (select datos -> 'integrantes' from public.inscripciones where id = 'ffffffff-0000-4000-8000-000000000001')
     || '[{"id":"i4","nombre":"Bebé Pérez","edad":"1","categoria":"ninos"}]'::jsonb),
  'terminal', null, null, 'Se suma el bebé') ->> 'error' = 'cambia_el_monto', 'agregar a alguien que cambia el monto: no');
select pg_temp.ok(public.panel_corregir_inscripcion('ffffffff-0000-4000-8000-000000000001',
  '{"transporte":"no"}'::jsonb, 'terminal', null, null, 'No viajan') ->> 'error' = 'cambia_el_monto', 'una respuesta del grupo que cambia el monto: no');

\echo '--- Cupo presencial en personas (equipos de un torneo híbrido)'
reset role; set role anon;
select pg_temp.ok((public.enviar_inscripcion(:'t3', jsonb_build_object('id', 'abcdabcd-0000-4000-8000-000000000001', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Presencial A","modalidad":"presencial","telefono":"3624000101","integrantes":[{"id":"i1","responsable":true,"nombre":"A1","dni":"50000001"},{"id":"i2","nombre":"A2","dni":"50000002"},{"id":"i3","nombre":"A3","dni":"50000003"},{"id":"i4","nombre":"A4","dni":"50000004"}]}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 1000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok')::boolean, 'equipo presencial de 4');
select pg_temp.ok((public.estado_sesion(:'t3') -> 'presenciales' ->> 'quedan')::int = 2, 'quedan 2 lugares (cuenta personas, no equipos)');
select pg_temp.ok((public.enviar_inscripcion(:'t3', jsonb_build_object('id', 'abcdabcd-0000-4000-8000-000000000002', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Presencial B","modalidad":"presencial","telefono":"3624000102","integrantes":[{"id":"i1","responsable":true,"nombre":"B1","dni":"50000011"},{"id":"i2","nombre":"B2","dni":"50000012"}]}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 1000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok')::boolean, 'equipo presencial de 2');
select pg_temp.ok((public.estado_sesion(:'t3') -> 'presenciales' ->> 'cerradasEn') is not null, 'con 6 personas se cierran solos los presenciales');

\echo '--- Los eventos por persona y por pareja siguen igual'
reset role;
select pg_temp.ok(public.personas_de('pareja', '{}') = 2 and public.personas_de('persona', '{"integrantes":[1,2]}') = 1, 'personas de pareja y persona'),
       pg_temp.ok(public.claves_inscripcion('{"telefono":"3624-111"}') = array['3624111'], 'sin DNI, el teléfono'),
       pg_temp.ok(public.claves_inscripcion('{"dni":"30.111.222","telefono":"3624"}') = array['30111222'], 'con DNI, el DNI'),
       pg_temp.ok(public.calcular_monto_inscripcion('{"unidad":"persona","categorias":[],"campos":[],"conceptos":[{"precios":[{"monto":100}]}]}', null, '{}', current_date) = 100, 'monto por persona');
select pg_temp.ok((select count(*) from public.inscripciones i join public.eventos e on e.id = i.evento_id where e.unidad = 'pareja' and i.personas <> 2) = 0, 'las parejas cargadas antes quedan con 2 personas');

select 'Pruebas de grupos: todo OK' as resultado;
