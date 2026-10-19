-- Pruebas de 020 (nombres sin repetir, borrar y archivar eventos: D63 y D65). Base con 001 a 020 cargados.
--   D=herramientas/pruebas-integradas/defgrupo.mjs
--   psql -v fut="$(node $D persona $(date -d '+20 days' +%F))" -v hoy="$(node $D persona $(date +%F))" -f supabase/pruebas_020.sql
-- Cada control que falla corta la prueba con «FALLÓ: …».
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/020_borrar_archivar.sql
\i supabase/020_borrar_archivar.sql
create or replace function pg_temp.ok(c boolean, msg text) returns text language plpgsql as $$
begin if c is not true then raise exception 'FALLÓ: %', msg; end if; return 'ok · ' || msg; end $$;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['responsable','organizador','tesorero'], true) ->> 'ok' as organizador;
select public.panel_guardar_usuario('marta@gmail.com', 'Marta López', array['tesorero'], true) ->> 'ok' as tesorera;

\echo '--- Nombres sin repetir'
select jsonb_set(:'fut', '{nombre}', '"Jornada de prueba"') as d1 \gset
select jsonb_set(:'fut', '{nombre}', '"  jornada  de PRUEBA "') as d2 \gset
select public.panel_guardar_borrador(null, :'d1') ->> 'id' as b1 \gset
select public.panel_abrir_evento(:'b1', :'d1') ->> 'id' as ev1 \gset
select public.panel_guardar_borrador(null, :'d2') ->> 'id' as b2 \gset
select pg_temp.ok(public.panel_abrir_evento(:'b2', :'d2') ->> 'detalle' = 'ya hay otro evento con ese nombre', 'mismo nombre (mayúsculas y espacios): no se abre'),
       pg_temp.ok(public.panel_abrir_evento(:'b2', jsonb_set(:'d2', '{nombre}', '"Jornada de prueba 2"')) ->> 'ok' = 'true', 'con otro nombre sí');
select jsonb_set(:'fut', '{nombre}', '"Jornada de prueba"') as d3 \gset
select public.panel_guardar_borrador(null, :'d3') ->> 'id' as b3 \gset

\echo '--- Borrar: solo sin datos y escribiendo el nombre'
select public.panel_crear_acceso(:'ev1', 'Carga Uno', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c1 \gset
select public.activar_acceso(:'c1', 'disp-020-01') ->> 'token' as t1 \gset
select pg_temp.ok(public.panel_estado_borrado(:'ev1') ->> 'inscripciones' = '0', 'estado: sin inscripciones'),
       pg_temp.ok(public.panel_borrar_evento(:'ev1', 'Jornada') ->> 'error' = 'confirmacion_incorrecta', 'nombre mal escrito: no borra'),
       pg_temp.ok(public.panel_borrar_evento('retiro-matrimonios-modelo', 'Retiro de matrimonios (modelo)') ->> 'error' = 'evento_inexistente', 'un evento modelo no se borra');
select pg_temp.ok(public.panel_borrar_evento(:'ev1', 'JORNADA DE PRUEBA') ->> 'ok' = 'true', 'sin datos y con el nombre: se borra');
select pg_temp.ok(not exists (select 1 from public.eventos where id = :'ev1'), 'ya no está'),
       pg_temp.ok(not exists (select 1 from public.accesos where evento_id = :'ev1'), 'sus QR tampoco'),
       pg_temp.ok(public.estado_sesion(:'t1') ->> 'error' = 'sesion_invalida', 'el celular que lo tenía activado se entera'),
       pg_temp.ok(exists (select 1 from public.auditoria where accion = 'borrar_evento' and entidad_id = :'ev1'), 'queda en la auditoría');
\echo '--- Ahora el nombre quedó libre'
select pg_temp.ok(public.panel_abrir_evento(:'b3', :'d3') ->> 'ok' = 'true', 'el borrador con ese nombre ya se puede abrir');
select id as ev3 from public.eventos where nombre = 'Jornada de prueba' \gset

\echo '--- Un evento con datos no se borra (ni con la inscripción anulada)'
select public.panel_crear_acceso(:'ev3', 'Carga Tres', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c3 \gset
select public.activar_acceso(:'c3', 'disp-020-03') ->> 'token' as t3 \gset
select pg_temp.ok((public.enviar_inscripcion(:'t3', jsonb_build_object('id', 'b0000000-0000-4000-8000-000000000001', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre":"Ana Sosa","dni":"30111222","telefono":"3624111222"}'::jsonb, 'conceptos', '[]'::jsonb, 'monto', 1000, 'pago', '{"medio":"efectivo"}'::jsonb)) ->> 'ok')::boolean, 'una inscripción en efectivo'),
       pg_temp.ok((public.enviar_inscripcion(:'t3', jsonb_build_object('id', 'b0000000-0000-4000-8000-000000000002', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre":"Beto Ruiz","dni":"30111333","telefono":"3624111333"}'::jsonb, 'conceptos', '[]'::jsonb, 'monto', 1000, 'pago', '{"medio":"terminal"}'::jsonb)) ->> 'ok')::boolean, 'una con terminal');
select pg_temp.ok(public.panel_anular_inscripcion('b0000000-0000-4000-8000-000000000002', 'prueba de anulación') ->> 'ok' = 'true', 'se anula la de terminal');
select pg_temp.ok(public.panel_borrar_evento(:'ev3', 'Jornada de prueba') ->> 'error' = 'evento_con_datos', 'con inscripciones: no se borra'),
       pg_temp.ok(exists (select 1 from public.eventos where id = :'ev3'), 'sigue ahí');

\echo '--- Archivar: con efectivo pendiente no se puede'
select pg_temp.ok((public.pendiente_de_rendir(:'ev3') ->> 'efectivo')::int = 1000 and (public.pendiente_de_rendir(:'ev3') ->> 'tickets')::int = 0, 'pendiente: $ 1000 y 0 tickets (la anulada no cuenta)'),
       pg_temp.ok(public.panel_archivar_evento(:'ev3', true, 'Jornada de prueba') ->> 'error' = 'pendiente_rendir', 'efectivo sin rendir: no se archiva');
select pg_temp.ok(public.panel_registrar_rendicion(:'ev3', 'Carga Tres', 1000, 'rinde todo', 0) ->> 'ok' = 'true', 'rinde el efectivo');
\echo '--- Tickets pendientes también lo impiden'
select pg_temp.ok((public.enviar_inscripcion(:'t3', jsonb_build_object('id', 'b0000000-0000-4000-8000-000000000003', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre":"Caro Díaz","dni":"30111444","telefono":"3624111444"}'::jsonb, 'conceptos', '[]'::jsonb, 'monto', 1000, 'pago', '{"medio":"terminal"}'::jsonb)) ->> 'ok')::boolean, 'otra con terminal');
select pg_temp.ok(public.panel_archivar_evento(:'ev3', true, 'Jornada de prueba') ->> 'error' = 'pendiente_rendir', 'un ticket sin entregar: no se archiva');
select pg_temp.ok(public.panel_registrar_rendicion(:'ev3', 'Carga Tres', 0, 'el ticket', 1) ->> 'ok' = 'true', 'entrega el ticket');

\echo '--- Evento que todavía no pasó: hay que escribir el nombre'
select pg_temp.ok(public.panel_archivar_evento(:'ev3', true, null) ->> 'error' = 'confirmacion_incorrecta', 'sin el nombre: no'),
       pg_temp.ok(public.panel_estado_borrado(:'ev3') ->> 'terminado' = 'false', 'todavía no terminó');
set request.jwt.claims = '{"email":"marta@gmail.com"}';
select pg_temp.ok(public.panel_archivar_evento(:'ev3', true, 'Jornada de prueba') ->> 'error' = 'sin_permiso', 'la tesorera no puede archivar'),
       pg_temp.ok(public.panel_borrar_evento(:'ev3', 'Jornada de prueba') ->> 'error' = 'sin_permiso', 'ni borrar');
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_crear_acceso(:'ev3', 'Puerta Tres', 'presentes', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as p3 \gset
select pg_temp.ok(public.panel_archivar_evento(:'ev3', true, 'jornada de prueba') ->> 'ok' = 'true', 'con todo rendido y el nombre: se archiva');

\echo '--- Archivado: nada se borra, todo se cierra'
select pg_temp.ok((select count(*) from public.inscripciones where evento_id = :'ev3') = 3, 'las 3 inscripciones siguen'),
       pg_temp.ok((select inscripciones_cerradas_en is not null from public.eventos where id = :'ev3'), 'inscripciones cerradas'),
       pg_temp.ok(not exists (select 1 from public.accesos where evento_id = :'ev3' and cerrado_en is null), 'todos los QR cerrados'),
       pg_temp.ok(public.activar_acceso(:'p3', 'disp-020-04') ->> 'error' = 'acceso_cerrado', 'el QR de la puerta ya no se activa'),
       pg_temp.ok(public.panel_crear_acceso(:'ev3', 'Otra', 'presentes', now(), now() + interval '2 hours') ->> 'error' = 'evento_archivado', 'no se crean QR'),
       pg_temp.ok(not (public._datos_accesos() -> 'eventos' @> jsonb_build_array(jsonb_build_object('id', :'ev3'))), 'no aparece en «QR de colaboradores»'),
       pg_temp.ok((select e ->> 'archivadoEn' is not null from jsonb_array_elements(public.panel_eventos() -> 'eventos') e where e ->> 'id' = :'ev3'), 'el panel lo ve como archivado');
\echo '--- Un celular sin internet que manda después del archivo: llega igual, marcado'
-- (como si se hubiera archivado hace media hora: dentro de los 10 minutos de margen no se marca, D38)
update public.eventos set inscripciones_cerradas_en = now() - interval '30 minutes' where id = :'ev3';
update public.accesos set cerrado_en = now() - interval '30 minutes' where evento_id = :'ev3';
select pg_temp.ok((public.enviar_inscripcion(:'t3', jsonb_build_object('id', 'b0000000-0000-4000-8000-000000000004', 'creadaEn', now(), 'diaCarga', current_date,
  'datos', '{"nombre":"Dani Paz","dni":"30111555","telefono":"3624111555"}'::jsonb, 'conceptos', '[]'::jsonb, 'monto', 1000, 'pago', '{"medio":"transferencia","banco":"MP","ultimos6":"ABC123"}'::jsonb)) ->> 'ok')::boolean, 'se recibe');
select pg_temp.ok((select fuera_de_horario from public.inscripciones where id = 'b0000000-0000-4000-8000-000000000004'), 'marcada «fuera de horario»');
\echo '--- Con el archivado, el mismo nombre queda libre; y se puede volver a mostrar'
select jsonb_set(:'fut', '{nombre}', '"Jornada de prueba"') as d4 \gset
select public.panel_guardar_borrador(null, :'d4') ->> 'id' as b4 \gset
select pg_temp.ok(public.panel_abrir_evento(:'b4', :'d4') ->> 'ok' = 'true', 'otro «Jornada de prueba» se puede abrir');
select pg_temp.ok(public.panel_archivar_evento(:'ev3', false) ->> 'ok' = 'true', 'volver a mostrar'),
       pg_temp.ok(public.panel_archivar_evento(:'ev3', false) ->> 'error' = 'no_archivado', 'dos veces: avisa');
select pg_temp.ok((select archivado_en is null and inscripciones_cerradas_en is not null from public.eventos where id = :'ev3'), 'a la vista, con las inscripciones todavía cerradas'),
       pg_temp.ok(exists (select 1 from public.auditoria where accion = 'archivar_evento' and entidad_id = :'ev3')
                  and exists (select 1 from public.auditoria where accion = 'desarchivar_evento' and entidad_id = :'ev3'), 'archivar y mostrar quedan en la auditoría');

\echo '--- Un evento que ya terminó se archiva sin escribir el nombre'
update public.eventos set fecha = current_date - 3, definicion = jsonb_set(definicion, '{fecha}', to_jsonb((current_date - 3)::text)) where id = :'ev3';
select pg_temp.ok(public.panel_estado_borrado(:'ev3') ->> 'terminado' = 'true', 'ya terminó'),
       pg_temp.ok(public.panel_archivar_evento(:'ev3', true, null) ->> 'ok' = 'true', 'se archiva sin escribir el nombre');

\echo '--- Seguridad: lo interno no se puede llamar desde la app'
reset role; set role anon;
select pg_temp.ok(not has_function_privilege('anon', 'public.panel_borrar_evento(text, text)', 'execute'), 'anon no borra'),
       pg_temp.ok(not has_function_privilege('anon', 'public.panel_archivar_evento(text, boolean, text)', 'execute'), 'anon no archiva'),
       pg_temp.ok(not has_function_privilege('authenticated', 'public.pendiente_de_rendir(text)', 'execute'), 'función interna cerrada'),
       pg_temp.ok(not has_function_privilege('authenticated', 'public.evento_mismo_nombre(text, text)', 'execute'), 'función interna cerrada (nombre)');
reset role;

select 'Pruebas de borrar y archivar: todo OK' as resultado;
