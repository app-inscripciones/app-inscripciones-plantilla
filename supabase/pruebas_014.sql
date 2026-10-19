-- Pruebas de 014 (evento de práctica, D56). Base con 001 a 014 cargados.
-- Se ejecuta con las definiciones que arma la app (src/logica/practica.js):
--   psql -v def="$(node herramientas/pruebas-integradas/defpract.mjs HOY)" -v def_lejos="$(node herramientas/pruebas-integradas/defpract.mjs HOY+5)" -f supabase/pruebas_014.sql
\set ON_ERROR_STOP on
set client_min_messages = warning;
\i supabase/014_practica.sql
\i supabase/014_practica.sql

\echo '--- Crear la práctica (Organizador)'
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['responsable','organizador','tesorero'], true) ->> 'ok' as carlos_organizador;
select public.panel_guardar_usuario('mira@gmail.com', 'Mira Consulta', array['consulta'], true) ->> 'ok' as alta_consulta;
select public.panel_crear_practica(:'def') ->> 'id' as id_prac \gset
select :'id_prac' as practica_creada;
select (x ->> 'practica')::boolean as marcada_en_panel from jsonb_array_elements(public.panel_eventos() -> 'eventos') x where x ->> 'id' = :'id_prac';
select not exists (select 1 from jsonb_array_elements(public.panel_borradores() -> 'copiables') x where x ->> 'id' = :'id_prac') as no_se_copia,
       jsonb_array_length(public.panel_borradores() -> 'practicas') as practicas_listadas;
select public.panel_crear_practica(:'def_lejos') ->> 'detalle' as fecha_lejana_rechazada;

\echo '--- Consulta no puede crear prácticas'
set request.jwt.claims = '{"email":"mira@gmail.com"}';
select public.panel_crear_practica(:'def') ->> 'error' as consulta;

\echo '--- QR, celular y carga (igual que un evento real)'
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select (x ->> 'practica')::boolean as marcada_en_qr from jsonb_array_elements(public.panel_datos_accesos() -> 'eventos') x where x ->> 'id' = :'id_prac';
select public.panel_crear_acceso(:'id_prac', 'Voluntaria Práctica', 'cargar', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c_vol \gset
select public.panel_crear_acceso(:'id_prac', 'Puerta Práctica', 'presentes', now() - interval '1 hour', now() + interval '3 hours') ->> 'codigo' as c_pue \gset
reset role; set role anon;
select public.activar_acceso(:'c_vol', 'dispositivo-practica-01') as act \gset
select (:'act'::jsonb -> 'evento' ->> 'practica')::boolean as celular_sabe_que_es_practica;
select :'act'::jsonb ->> 'token' as t_vol \gset
select public.enviar_inscripcion(:'t_vol', jsonb_build_object('id','bbbbbbbb-0000-4000-8000-000000000001','creadaEn',now(),'diaCarga',current_date,
  'categoria','jovenes','datos','{"nombre":"Ana Práctica","dni":"30111222","telefono":"3624111222","edad":"20","transporte":"si","restricciones":"no"}'::jsonb,
  'conceptos','[{"id":"matricula","monto":3000},{"id":"transporte","monto":500}]'::jsonb,'monto',3500,'pago','{"medio":"efectivo"}'::jsonb)) ->> 'ok' as inscripcion_ok;
select public.activar_acceso(:'c_pue', 'dispositivo-practica-02') ->> 'token' as t_pue \gset
select jsonb_array_length(public.lista_puerta(:'t_pue') -> 'inscripciones') as en_la_puerta;
reset role;
select monto, monto_revisar = false as monto_correcto from public.inscripciones where id = 'bbbbbbbb-0000-4000-8000-000000000001';

\echo '--- Limpieza: borra solo la práctica vencida, con todo lo cargado'
insert into public.eventos (id, nombre, fecha, unidad, estado, practica, definicion)
select 'practica-vieja', 'Práctica vieja', current_date - 12, 'persona', 'abierto', true,
       :'def'::jsonb || jsonb_build_object('fecha', current_date - 12, 'fechaFin', current_date - 6, 'practica', true);
insert into public.eventos (id, nombre, fecha, unidad, estado, practica, definicion)
select 'real-viejo', 'Evento real viejo', current_date - 60, 'persona', 'abierto', false, :'def'::jsonb;
insert into public.colaboradores (nombre) values ('Vieja Voluntaria') on conflict do nothing;
insert into public.accesos (id, evento_id, colaborador_id, tarea, desde, hasta, codigo_hash)
select 'cccccccc-0000-4000-8000-000000000001', 'practica-vieja', id, 'cargar', now() - interval '12 days', now() - interval '11 days', 'x-vieja'
from public.colaboradores where nombre = 'Vieja Voluntaria';
insert into public.sesiones (id, acceso_id, dispositivo, token_hash)
values ('cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001', 'dispositivo-viejo-01', 'h-vieja');
insert into public.inscripciones (id, evento_id, cargador, creada_en_local, dia_carga, datos, conceptos, monto, medio_pago, sesion_id)
values ('cccccccc-0000-4000-8000-000000000003', 'practica-vieja', 'Vieja Voluntaria', now() - interval '12 days', current_date - 12, '{"nombre":"Uno"}', '[]', 1000, 'efectivo', 'cccccccc-0000-4000-8000-000000000002'),
       ('cccccccc-0000-4000-8000-000000000004', 'practica-vieja', 'Vieja Voluntaria', now() - interval '12 days', current_date - 12, '{"nombre":"Uno bis"}', '[]', 1000, 'efectivo', 'cccccccc-0000-4000-8000-000000000002'),
       ('cccccccc-0000-4000-8000-000000000005', 'real-viejo', 'Real Voluntaria', now() - interval '60 days', current_date - 60, '{"nombre":"Real"}', '[]', 1000, 'efectivo', null);
update public.inscripciones set estado = 'posible_duplicado', duplicado_de = 'cccccccc-0000-4000-8000-000000000003' where id = 'cccccccc-0000-4000-8000-000000000004';
insert into public.asistencias (id, evento_id, inscripcion_id, instancia, marcado_por, marcada_en)
values ('cccccccc-0000-4000-8000-000000000006', 'practica-vieja', 'cccccccc-0000-4000-8000-000000000003', 'llegada', 'Vieja Puerta', now() - interval '12 days');
insert into public.rendiciones (evento_id, cargador, monto, recibido_por) values ('practica-vieja', 'Vieja Voluntaria', 1000, 'carlos@gmail.com');

select public.limpiar_practicas() as practicas_borradas;
select not exists (select 1 from public.eventos where id = 'practica-vieja') as vieja_borrada,
       not exists (select 1 from public.inscripciones where evento_id = 'practica-vieja') as sus_inscripciones,
       not exists (select 1 from public.accesos where evento_id = 'practica-vieja') as sus_qr,
       exists (select 1 from public.eventos where id = 'real-viejo') as real_intacto,
       exists (select 1 from public.inscripciones where evento_id = 'real-viejo') as inscripcion_real_intacta,
       exists (select 1 from public.eventos where id = :'id_prac') as practica_vigente_intacta,
       exists (select 1 from public.auditoria where accion = 'borrar_practicas') as queda_en_auditoria;
select public.limpiar_practicas() as segunda_vez;

\echo '--- Tope: hasta 5 prácticas a la vez'
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_crear_practica(:'def') ->> 'ok' as p2, public.panel_crear_practica(:'def') ->> 'ok' as p3,
       public.panel_crear_practica(:'def') ->> 'ok' as p4, public.panel_crear_practica(:'def') ->> 'ok' as p5;
select public.panel_crear_practica(:'def') ->> 'error' as sexta;
reset role;
