-- Pruebas de 019 (autopresente con QR, R20 y D62). Base con 001 a 019 cargados.
--   D=herramientas/pruebas-integradas/defgrupo.mjs; F=$(date +%F)
--   psql -v tor="$(node $D torneo $F)" -v fam="$(node $D familias $F)" -v per="$(node $D persona $F)" -f supabase/pruebas_019.sql
-- Cada control que falla corta la prueba con «FALLÓ: …».
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/019_autopresente.sql
\i supabase/019_autopresente.sql
create or replace function pg_temp.ok(c boolean, msg text) returns text language plpgsql as $$
begin if c is not true then raise exception 'FALLÓ: %', msg; end if; return 'ok · ' || msg; end $$;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['responsable','organizador','tesorero'], true) ->> 'ok' as organizador;

\echo '--- Eventos: torneo (equipo junto), familias (cada integrante) con autopresente; torneo sin autopresente'
select public.panel_guardar_borrador(null, jsonb_set(:'tor', '{asistencia,autopresente}', 'true')) ->> 'id' as b1 \gset
select public.panel_abrir_evento(:'b1', jsonb_set(:'tor', '{asistencia,autopresente}', 'true')) ->> 'id' as ev_tor \gset
select public.panel_guardar_borrador(null, jsonb_set(:'fam', '{asistencia,autopresente}', 'true')) ->> 'id' as b2 \gset
select public.panel_abrir_evento(:'b2', jsonb_set(:'fam', '{asistencia,autopresente}', 'true')) ->> 'id' as ev_fam \gset
select public.panel_guardar_borrador(null, jsonb_set(:'tor', '{nombre}', '"Torneo sin autopresente"')) ->> 'id' as b3 \gset
select public.panel_abrir_evento(:'b3', jsonb_set(:'tor', '{nombre}', '"Torneo sin autopresente"')) ->> 'id' as ev_sin \gset
select (public.config_asistencia(:'ev_fam') -> 'instancias' -> 0 ->> 'id') as inst \gset
select pg_temp.ok(public.panel_crear_autopresente(:'ev_sin', :'inst', 'impreso', now() - interval '1 hour', now() + interval '2 hours') ->> 'error' = 'autopresente_no_habilitado', 'sin activar en el evento: no se puede'),
       pg_temp.ok(public.panel_crear_autopresente(:'ev_fam', 'otro', 'impreso', now(), now() + interval '2 hours') ->> 'error' = 'datos_invalidos', 'momento que no existe'),
       pg_temp.ok(public.panel_crear_autopresente(:'ev_fam', :'inst', 'impreso', now(), now() + interval '8 days') ->> 'error' = 'horario_invalido', 'más de 7 días');

\echo '--- Inscripciones (desde un celular de cargador)'
select public.panel_crear_acceso(:'ev_fam', 'Carga F', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as cf \gset
select public.panel_crear_acceso(:'ev_tor', 'Carga T', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as ct \gset
select public.activar_acceso(:'cf', 'disp-auto-01') ->> 'token' as tf \gset
select public.activar_acceso(:'ct', 'disp-auto-02') ->> 'token' as tt \gset
select pg_temp.ok((public.enviar_inscripcion(:'tf', jsonb_build_object('id', 'a0000000-0000-4000-8000-000000000001', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Pérez","telefono":"3624111222","transporte":"no","integrantes":[
     {"id":"i1","responsable":true,"nombre":"Ana María Pérez","dni":"30111222","edad":"40","categoria":"adultos"},
     {"id":"i2","nombre":"Lola Pérez","dni":"50111222","edad":"7","categoria":"ninos"},
     {"id":"i3","nombre":"Juan Pérez","edad":"38","categoria":"adultos"}]}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 12000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok')::boolean, 'familia Pérez'),
       pg_temp.ok((public.enviar_inscripcion(:'tf', jsonb_build_object('id', 'a0000000-0000-4000-8000-000000000002', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Gómez","telefono":"3624999888","transporte":"no","integrantes":[
     {"id":"i1","responsable":true,"nombre":"Rosa Gómez","dni":"28000111","edad":"35","categoria":"adultos"},{"id":"i2","nombre":"Tomi Gómez","edad":"5","categoria":"ninos"}]}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 7000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok')::boolean, 'familia Gómez'),
       pg_temp.ok((public.enviar_inscripcion(:'tt', jsonb_build_object('id', 'a0000000-0000-4000-8000-000000000003', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre_grupo":"Los Pumas","telefono":"3624777666","integrantes":[
     {"id":"i1","responsable":true,"nombre":"P1","dni":"41000001"},{"id":"i2","nombre":"P2","dni":"41000002"},{"id":"i3","nombre":"P3","dni":"41000003"},
     {"id":"i4","nombre":"P4","dni":"41000004"},{"id":"i5","nombre":"P5","dni":"41000005"}]}'::jsonb,
  'conceptos', '[]'::jsonb, 'monto', 50000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok')::boolean, 'equipo Los Pumas');

\echo '--- QR impreso (familias, cada integrante por separado)'
select public.panel_crear_autopresente(:'ev_fam', :'inst', 'impreso', now() - interval '1 hour', now() + interval '2 hours') ->> 'codigo' as q1 \gset
reset role; set role anon;
select pg_temp.ok(public.autopresente_estado(:'q1') ->> 'evento' = 'Retiro de familias prueba' and (public.autopresente_estado(:'q1') ->> 'ok')::boolean, 'el QR sirve y muestra el evento'),
       pg_temp.ok(public.autopresente_estado('noexiste1234') ->> 'error' = 'qr_invalido', 'QR inventado');
select public.autopresente_buscar(:'q1', '50.111.222', 'cel-lola') as r \gset
select pg_temp.ok((:'r'::jsonb -> 'opciones') = jsonb_build_array(jsonb_build_object('opcion', 'a0000000-0000-4000-8000-000000000001|i2', 'nombre', 'Lola P.', 'yaPresente', false)),
                  'por DNI de un integrante: solo él, con el nombre oculto');
select pg_temp.ok(jsonb_array_length(public.autopresente_buscar(:'q1', '3624-111222', 'cel-ana') -> 'opciones') = 3, 'por teléfono de la familia: los 3 integrantes'),
       pg_temp.ok(public.autopresente_buscar(:'q1', '3624-111222', 'cel-ana') -> 'opciones' -> 0 ->> 'nombre' = 'Ana M. P.', 'nombre oculto «Ana M. P.»'),
       pg_temp.ok(public.autopresente_buscar(:'q1', '5011122', 'cel-x') ->> 'error' = 'no_encontrado', 'número parecido: no encuentra (coincidencia exacta)'),
       pg_temp.ok(public.autopresente_buscar(:'q1', '123', 'cel-x') ->> 'error' = 'dato_corto', 'menos de 6 números');
select pg_temp.ok(public.autopresente_marcar(:'q1', '50111222', array['a0000000-0000-4000-8000-000000000001|i2']) -> 'resultados' -> 0 ->> 'resultado' = 'ok', 'Lola se marca sola'),
       pg_temp.ok((public.autopresente_buscar(:'q1', '50111222', 'cel-lola') -> 'opciones' -> 0 ->> 'yaPresente')::boolean, 'después aparece «ya presente»'),
       pg_temp.ok(public.autopresente_marcar(:'q1', '50111222', array['a0000000-0000-4000-8000-000000000001|i2']) -> 'resultados' -> 0 ->> 'resultado' = 'ya_presente', 'no se duplica'),
       pg_temp.ok(public.autopresente_marcar(:'q1', '50111222', array['a0000000-0000-4000-8000-000000000002|i1']) ->> 'error' = 'no_encontrado', 'no puede marcar a otra persona con su DNI'),
       pg_temp.ok(public.autopresente_marcar(:'q1', '3624999888', array['a0000000-0000-4000-8000-000000000002|i1', 'a0000000-0000-4000-8000-000000000002|i2']) ->> 'ok' = 'true', 'la familia Gómez marca a los dos con su teléfono');
reset role;
select pg_temp.ok((select count(*) from public.asistencias where evento_id = :'ev_fam' and origen = 'autopresente' and marcado_por = 'Se anotó solo' and estado = 'presente') = 3, 'quedan 3 marcas «Se anotó solo»');

\echo '--- Límite de intentos: 8 búsquedas sin resultado por celular cada 15 minutos'
set role anon;
select count(*) filter (where public.autopresente_buscar(:'q1', (40000000 + k)::text, 'cel-curioso') ->> 'error' = 'no_encontrado') as fallidas from generate_series(1, 8) k;
select pg_temp.ok(public.autopresente_buscar(:'q1', '50111222', 'cel-curioso') ->> 'error' = 'demasiados_intentos', 'al 9.º intento, bloqueado (aunque el dato sea correcto)'),
       pg_temp.ok((public.autopresente_buscar(:'q1', '50111222', 'otro-celular') ->> 'ok')::boolean, 'otro celular sigue pudiendo');

\echo '--- Torneo (el equipo junto): un jugador marca a todo el equipo'
reset role;
select (public.config_asistencia(:'ev_tor') -> 'instancias' -> 0 ->> 'id') as inst_t \gset
select public.panel_crear_autopresente(:'ev_tor', :'inst_t', 'pantalla', now() - interval '1 hour', now() + interval '2 hours') as qt \gset
select (:'qt'::jsonb ->> 'codigo') as qt_base, (:'qt'::jsonb ->> 'pantalla') as qt_pantalla \gset
set role anon;
select pg_temp.ok(public.autopresente_estado(:'qt_base') ->> 'error' = 'qr_viejo', 'QR en pantalla: el código fijo solo (una foto) no sirve');
select public.autopresente_pantalla(:'qt_pantalla') ->> 'codigo' as qt_ahora \gset
select pg_temp.ok((public.autopresente_estado(:'qt_ahora') ->> 'ok')::boolean, 'el código que muestra la pantalla ahora sí sirve'),
       pg_temp.ok(public.autopresente_estado(:'qt_base' || '.00000000') ->> 'error' = 'qr_viejo', 'un código de otro momento no sirve'),
       pg_temp.ok(public.autopresente_pantalla('ffff') ->> 'error' = 'qr_invalido', 'pantalla inventada');
reset role;
select pg_temp.ok(public.autopresente_estado(:'qt_base' || '.' || public.autopresente_codigo_ventana(secreto, public.autopresente_ventana() - 1)) ->> 'ok' = 'true', 'el de hace 30 segundos todavía sirve'),
       pg_temp.ok(public.autopresente_estado(:'qt_base' || '.' || public.autopresente_codigo_ventana(secreto, public.autopresente_ventana() - 2)) ->> 'error' = 'qr_viejo', 'el de hace un minuto ya no')
from public.autopresentes where codigo = :'qt_base';
set role anon;
select pg_temp.ok(public.autopresente_buscar(:'qt_ahora', '41000003', 'cel-p3') -> 'opciones' -> 0 ->> 'nombre' = 'Los P.', 'por DNI de un jugador: el equipo («Los P.»)'),
       pg_temp.ok(public.autopresente_marcar(:'qt_ahora', '41000003', array['a0000000-0000-4000-8000-000000000003|']) -> 'resultados' -> 0 ->> 'resultado' = 'ok', 'marca al equipo');

\echo '--- Evento por persona'
reset role;
select public.panel_guardar_borrador(null, jsonb_set(:'per', '{asistencia,autopresente}', 'true')) ->> 'id' as b4 \gset
select public.panel_abrir_evento(:'b4', jsonb_set(:'per', '{asistencia,autopresente}', 'true')) ->> 'id' as ev_per \gset
select public.panel_crear_acceso(:'ev_per', 'Carga P', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as cp \gset
select public.activar_acceso(:'cp', 'disp-auto-03') ->> 'token' as tpp \gset
select pg_temp.ok((public.enviar_inscripcion(:'tpp', jsonb_build_object('id', 'a0000000-0000-4000-8000-000000000004', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre":"Ana Paula Sosa","dni":"33444555","telefono":"3624123456"}'::jsonb, 'conceptos', '[]'::jsonb, 'monto', 1000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok')::boolean, 'inscripción por persona');
select public.panel_crear_autopresente(:'ev_per', public.config_asistencia(:'ev_per') -> 'instancias' -> 0 ->> 'id', 'impreso', now() - interval '1 hour', now() + interval '2 hours') ->> 'codigo' as qp \gset
set role anon;
select pg_temp.ok(public.autopresente_buscar(:'qp', '33.444.555', 'cel-ana') -> 'opciones' = jsonb_build_array(jsonb_build_object('opcion', 'a0000000-0000-4000-8000-000000000004|', 'nombre', 'Ana P. S.', 'yaPresente', false)), 'por persona: por DNI'),
       pg_temp.ok(jsonb_array_length(public.autopresente_buscar(:'qp', '3624123456', 'cel-ana') -> 'opciones') = 1, 'por persona: por teléfono'),
       pg_temp.ok(public.autopresente_marcar(:'qp', '33444555', array['a0000000-0000-4000-8000-000000000004|']) -> 'resultados' -> 0 ->> 'resultado' = 'ok', 'por persona: queda presente');

\echo '--- Panel'
reset role;
select pg_temp.ok((p -> 'porInstancia' -> 0 ->> 'seAnotaronSolos')::int = 3 and (p -> 'porInstancia' -> 0 ->> 'presentes')::int = 3, 'familias: 3 presentes, los 3 se anotaron solos'),
       pg_temp.ok(p -> 'marcas' -> 0 ->> 'origen' = 'autopresente', 'la marca dice su origen')
from public.panel_presentes(:'ev_fam') p;
select pg_temp.ok(jsonb_array_length(a -> 'qrs') = 1 and (a -> 'qrs' -> 0 ->> 'marcas')::int = 3 and (a ->> 'habilitado')::boolean, 'lista de QR con sus marcas')
from public.panel_autopresentes(:'ev_fam') a;
select pg_temp.ok(public.panel_autopresentes(:'ev_sin') ->> 'habilitado' = 'false', 'evento sin autopresente');

\echo '--- Cerrar y vencer'
select public.panel_autopresentes(:'ev_fam') -> 'qrs' -> 0 ->> 'id' as id1 \gset
select pg_temp.ok(public.panel_cerrar_autopresente(:'id1') ->> 'ok' = 'true', 'cerrar el QR');
set role anon;
select pg_temp.ok(public.autopresente_estado(:'q1') ->> 'error' = 'qr_cerrado', 'cerrado: ya no sirve'),
       pg_temp.ok(public.autopresente_marcar(:'q1', '30111222', array['a0000000-0000-4000-8000-000000000001|i1']) ->> 'error' = 'qr_cerrado', 'ni para marcar');
reset role;
update public.autopresentes set desde = now() - interval '5 hours', hasta = now() - interval '1 hour' where codigo = :'qt_base';
select pg_temp.ok(public.autopresente_estado(:'qt_ahora') ->> 'error' = 'qr_vencido', 'fuera de horario: vencido');

\echo '--- Seguridad: lo interno no se puede llamar desde la app'
set role anon;
do $$ begin
  perform public._autopresente_opciones('x', '30111222');
  raise exception 'FALLÓ: anon pudo llamar a _autopresente_opciones';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.panel_crear_autopresente('x', 'x', 'impreso', now(), now() + interval '1 hour');
  raise exception 'FALLÓ: anon pudo crear un QR de autopresente';
exception when insufficient_privilege then null; end $$;
reset role;

select 'Pruebas del autopresente: todo OK' as resultado;
