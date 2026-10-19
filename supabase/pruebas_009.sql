-- Pruebas de 009 (después de pruebas_008.sql en la misma base).
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/009_asistente_eventos.sql
\i supabase/009_asistente_eventos.sql
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
\echo '--- borrador nuevo, se guarda en cada paso'
select public.panel_guardar_borrador(null, '{"nombre":"Campamento de Jóvenes","fecha":"2027-01-15","unidad":"persona"}') ->> 'id' as id_nuevo;
select public.panel_guardar_borrador(null, '{"nombre":"Campamento de Jóvenes","fecha":"2027-01-15"}') ->> 'id' as id_repetido;
select public.panel_guardar_borrador('campamento-de-jovenes-2027', '{"nombre":"Campamento de Jóvenes","fecha":"2027-01-16","unidad":"pareja","paso":"datos"}') ->> 'ok' as actualiza;
select jsonb_array_length(public.panel_borradores() -> 'borradores') as borradores,
       (select string_agg(x ->> 'id', ',') from jsonb_array_elements(public.panel_borradores() -> 'copiables') x) as copiables;
\echo '--- los borradores no aparecen en el panel ni para los QR'
select (select count(*) from jsonb_array_elements(public.panel_eventos() -> 'eventos') x where x ->> 'id' like 'campamento%') as en_panel;
\echo '--- abrir: definición inválida, luego válida'
select public.panel_abrir_evento('campamento-de-jovenes-2027', '{"nombre":"Campamento de Jóvenes","fecha":"2027-01-15","unidad":"persona","categorias":[],"campos":[{"id":"dni","etiqueta":"DNI","tipo":"dni"}],"conceptos":[{"id":"m","nombre":"Matrícula","precios":[{"monto":100}]}]}') - 'ok' as falta_nombre;
select public.panel_abrir_evento('campamento-de-jovenes-2027', '{"nombre":"Campamento de Jóvenes","fecha":"2027-01-15","unidad":"persona","categorias":[],"campos":[{"id":"nombre","etiqueta":"Nombre y apellido","tipo":"texto"}],"conceptos":[{"id":"m","nombre":"Matrícula","precios":[{"monto":100.5}]}]}') ->> 'detalle' as precio_decimal;
select public.panel_abrir_evento('campamento-de-jovenes-2027', '{"nombre":"Campamento de Jóvenes","fecha":"2020-01-15","unidad":"persona","categorias":[],"campos":[{"id":"nombre","etiqueta":"Nombre y apellido","tipo":"texto"}],"conceptos":[{"id":"m","nombre":"Matrícula","precios":[{"monto":100}]}],"asistencia":{"toma":false}}') ->> 'detalle' as fecha_pasada;
select public.panel_abrir_evento('campamento-de-jovenes-2027', '{"nombre":"Campamento de Jóvenes","fecha":"2027-01-15","unidad":"persona","categorias":[{"id":"a","nombre":"Adultos","edadMin":0,"edadMax":120}],"campos":[{"id":"nombre","etiqueta":"Nombre y apellido","tipo":"texto"}],"conceptos":[{"id":"m","nombre":"Matrícula","precios":[{"monto":100}]}]}') ->> 'detalle' as una_categoria;
select public.panel_abrir_evento('campamento-de-jovenes-2027', '{"nombre":"Campamento de Jóvenes","fecha":"2027-01-15","unidad":"persona","categorias":[],"campos":[{"id":"nombre","etiqueta":"Nombre y apellido","tipo":"texto","obligatorio":true},{"id":"dni","etiqueta":"DNI","tipo":"dni","obligatorio":true}],"conceptos":[{"id":"matricula","nombre":"Matrícula","aplicaSi":null,"precios":[{"hasta":"2026-12-15","nombreTramo":"Precio anticipado","monto":1000},{"nombreTramo":"Precio normal","monto":1500}]}],"asistencia":{"toma":true,"modoPareja":null,"instancias":[{"id":"llegada","nombre":"Llegada","fecha":"2027-01-15"}],"camposBusqueda":["nombre","dni"],"campoProcedencia":null}}') as abre;
reset role;
select id, nombre, fecha, unidad, estado, abierto_por is not null as con_autor from public.eventos where id = 'campamento-de-jovenes-2027';
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
\echo '--- abierto: ya no se cambia ni se borra; aparece en panel y para QR'
select public.panel_guardar_borrador('campamento-de-jovenes-2027', '{"nombre":"Otro"}') ->> 'error' as no_cambia;
select public.panel_borrar_borrador('campamento-de-jovenes-2027') ->> 'error' as no_borra;
select public.panel_abrir_evento('campamento-de-jovenes-2027', '{}') ->> 'error' as no_reabre;
select (select count(*) from jsonb_array_elements(public.panel_eventos() -> 'eventos') x where x ->> 'id' = 'campamento-de-jovenes-2027') as en_panel;
select (select count(*) from jsonb_array_elements(public.panel_datos_accesos() -> 'eventos') x where x ->> 'id' = 'campamento-de-jovenes-2027') as para_qr;
reset role; select (public.config_asistencia('campamento-de-jovenes-2027') -> 'instancias' -> 0 ->> 'nombre') as momento; set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
\echo '--- borrar borrador'
select public.panel_borrar_borrador('campamento-de-jovenes-2027-2') ->> 'ok' as borra;
\echo '--- borrador creado sin fecha: al abrir toma el identificador con el año'
select public.panel_guardar_borrador(null, '{"nombre":"Jornada Familiar"}') ->> 'id' as sin_fecha;
select public.panel_abrir_evento('jornada-familiar', '{"nombre":"Jornada Familiar","fecha":"2027-03-20","unidad":"persona","categorias":[],"campos":[{"id":"nombre","etiqueta":"Nombre y apellido","tipo":"texto"}],"conceptos":[{"id":"m","nombre":"Entrada","precios":[{"monto":0}]}],"asistencia":{"toma":false}}') ->> 'id' as id_final;
\echo '--- sin rol organizador'
set request.jwt.claims = '{"email":"intruso@mail.com"}';
select public.panel_guardar_borrador(null, '{"nombre":"X"}') ->> 'error' as intruso, public.panel_borradores() ->> 'error' as intruso_lista;
reset role;
select accion, entidad_id from public.auditoria where accion in ('crear_borrador', 'abrir_evento', 'borrar_borrador') order by id;
