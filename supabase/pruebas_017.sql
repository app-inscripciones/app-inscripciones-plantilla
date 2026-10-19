-- Pruebas de 017 (tickets de la terminal, D60). Base con 001 a 017.
\set ON_ERROR_STOP on
set client_min_messages = warning;
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
select public.panel_guardar_usuario('carlos@gmail.com', 'Carlos Coschiza', array['responsable','organizador','tesorero'], true) ->> 'ok' as tesorero;
reset role;
insert into public.inscripciones (id, evento_id, cargador, creada_en_local, dia_carga, datos, conceptos, monto, medio_pago, categoria)
select gen_random_uuid(), 'congreso-prueba', 'Tere Terminal', now(), current_date, jsonb_build_object('nombre', 'T ' || g),
       '[]', 3750, case when g <= 3 then 'terminal' else 'efectivo' end, 'adultos' from generate_series(1, 5) g;
set role authenticated;
set request.jwt.claims = '{"email":"carlos@gmail.com"}';
\echo '--- antes de rendir: 3 tickets y $7.500 en efectivo pendientes'
select x ->> 'ticketsTerminal' as tickets, x ->> 'ticketsPendientes' as faltan, x ->> 'aRendir' as efectivo
from jsonb_array_elements(public.panel_resumen('congreso-prueba') -> 'porCargador') x where x ->> 'cargador' = 'Tere Terminal';
\echo '--- entrega solo de tickets (sin efectivo)'
select public.panel_registrar_rendicion('congreso-prueba', 'Tere Terminal', 0, 'tickets del sábado', 2) - 'id' as solo_tickets;
\echo '--- entrega de efectivo y el último ticket'
select public.panel_registrar_rendicion('congreso-prueba', 'Tere Terminal', 7500, null, 1) - 'id' as todo;
\echo '--- una entrega vacía se rechaza; un número negativo también'
select public.panel_registrar_rendicion('congreso-prueba', 'Tere Terminal', 0, null, 0) ->> 'error' as vacia,
       public.panel_registrar_rendicion('congreso-prueba', 'Tere Terminal', 100, null, -1) ->> 'error' as negativo;
\echo '--- la versión anterior (sin tickets) sigue andando por nombre'
select public.panel_registrar_rendicion(p_evento => 'congreso-prueba', p_cargador => 'Tere Terminal', p_monto => 100) ->> 'ok' as compat;
select x ->> 'ticketsPendientes' as faltan, x ->> 'aRendir' as efectivo
from jsonb_array_elements(public.panel_resumen('congreso-prueba') -> 'porCargador') x where x ->> 'cargador' = 'Tere Terminal';
select public.panel_resumen('congreso-prueba') -> 'dinero' ->> 'ticketsRendidos' as total_tickets_rendidos;
select jsonb_agg(r ->> 'tickets' order by r ->> 'tickets') as tickets_en_historial from jsonb_array_elements(public.panel_rendiciones('congreso-prueba') -> 'rendiciones') r;
\echo '--- anular la entrega de tickets: vuelven a faltar 2'
select public.panel_anular_rendicion((select (r ->> 'id')::uuid from jsonb_array_elements(public.panel_rendiciones('congreso-prueba') -> 'rendiciones') r where r ->> 'tickets' = '2'), 'conté mal') ->> 'ok' as anulada;
select x ->> 'ticketsPendientes' as faltan from jsonb_array_elements(public.panel_resumen('congreso-prueba') -> 'porCargador') x where x ->> 'cargador' = 'Tere Terminal';
reset role;
select public.version_base() as version;
