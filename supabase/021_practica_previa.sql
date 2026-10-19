-- =====================================================================
-- Practicar antes de hacerlo de verdad (D66)
--  · La base anota sola, por persona, los pasos de práctica que ya hizo (no se pierden cuando la práctica
--    se borra a la semana):
--      Organizador: 'crear' (creó un evento de práctica), 'qr' (creó un QR en la práctica),
--                   'inscripcion' (llegó una inscripción a SU práctica), 'presente' (se marcó un presente en SU práctica).
--      Tesorero:    'rendicion' (registró una entrega en una práctica).
--  · El panel muestra avisos (no bloquean) mientras falte la práctica del rol.
-- Se ejecuta después de 001 a 020. Se puede volver a ejecutar sin problemas.
-- =====================================================================

create table if not exists public.practicas_hechas (
  correo  text not null,
  paso    text not null check (paso in ('crear', 'qr', 'inscripcion', 'presente', 'rendicion')),
  cuando  timestamptz not null default now(),
  primary key (correo, paso)
);
alter table public.practicas_hechas enable row level security;
revoke all on public.practicas_hechas from public, anon, authenticated;

create or replace function public._anotar_practica(p_correo text, p_paso text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.practicas_hechas (correo, paso) select lower(trim(p_correo)), p_paso
   where coalesce(trim(p_correo), '') like '%@%'
  on conflict (correo, paso) do nothing
$$;
revoke all on function public._anotar_practica(text, text) from public, anon, authenticated;

-- Disparadores: se anotan solos al usar un evento de práctica.
create or replace function public.tg_practica_hecha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.eventos;
begin
  if tg_table_name = 'eventos' then
    if new.practica then perform public._anotar_practica(new.creado_por, 'crear'); end if;
    return new;
  end if;
  select * into v_ev from public.eventos where id = new.evento_id;
  if not found or not v_ev.practica then return new; end if;
  if tg_table_name = 'accesos' then perform public._anotar_practica(new.creado_por, 'qr');
  elsif tg_table_name = 'inscripciones' then perform public._anotar_practica(v_ev.creado_por, 'inscripcion');
  elsif tg_table_name = 'asistencias' then perform public._anotar_practica(v_ev.creado_por, 'presente');
  elsif tg_table_name = 'rendiciones' then perform public._anotar_practica(new.recibido_por, 'rendicion');
  end if;
  return new;
end;
$$;
revoke all on function public.tg_practica_hecha() from public, anon, authenticated;

drop trigger if exists practica_hecha on public.eventos;
create trigger practica_hecha after insert on public.eventos for each row execute function public.tg_practica_hecha();
drop trigger if exists practica_hecha on public.accesos;
create trigger practica_hecha after insert on public.accesos for each row execute function public.tg_practica_hecha();
drop trigger if exists practica_hecha on public.inscripciones;
create trigger practica_hecha after insert on public.inscripciones for each row execute function public.tg_practica_hecha();
drop trigger if exists practica_hecha on public.asistencias;
create trigger practica_hecha after insert on public.asistencias for each row execute function public.tg_practica_hecha();
drop trigger if exists practica_hecha on public.rendiciones;
create trigger practica_hecha after insert on public.rendiciones for each row execute function public.tg_practica_hecha();

-- Lo ya hecho antes de instalar esto (prácticas que todavía existen y las creadas que quedaron en la auditoría).
insert into public.practicas_hechas (correo, paso)
select distinct lower(a.quien), 'crear' from public.auditoria a where a.accion = 'crear_practica' and a.quien like '%@%'
on conflict do nothing;
insert into public.practicas_hechas (correo, paso)
select distinct lower(x.correo), x.paso from (
  select e.creado_por as correo, 'crear' as paso from public.eventos e where e.practica
  union select a.creado_por, 'qr' from public.accesos a join public.eventos e on e.id = a.evento_id where e.practica
  union select e.creado_por, 'inscripcion' from public.inscripciones i join public.eventos e on e.id = i.evento_id where e.practica
  union select e.creado_por, 'presente' from public.asistencias s join public.eventos e on e.id = s.evento_id where e.practica
  union select r.recibido_por, 'rendicion' from public.rendiciones r join public.eventos e on e.id = r.evento_id where e.practica
) x where x.correo like '%@%'
on conflict do nothing;

-- Lo que ve el panel: los pasos de quien está mirando, y si alguien del equipo ya practicó como Organizador.
create or replace function public.panel_mi_practica()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_yo text := lower(public.correo_actual());
  v_pasos jsonb;
begin
  if not public.puede_ver_panel() then return jsonb_build_object('ok', false, 'error', 'sin_permiso'); end if;
  select coalesce(jsonb_object_agg(paso, cuando), '{}'::jsonb) into v_pasos from public.practicas_hechas where correo = v_yo;
  return jsonb_build_object('ok', true,
    'pasos', v_pasos,
    'organizadorHecha', v_pasos ?& array['crear', 'qr', 'inscripcion', 'presente'],
    'tesoreroHecha', v_pasos ? 'rendicion',
    'alguienPracticoOrganizador', exists (
      select 1 from public.practicas_hechas p where p.paso = 'crear'
       and (select count(*) from public.practicas_hechas q where q.correo = p.correo and q.paso in ('crear', 'qr', 'inscripcion', 'presente')) = 4));
end;
$$;
revoke all on function public.panel_mi_practica() from public, anon;
grant execute on function public.panel_mi_practica() to authenticated;

create or replace function public.version_base()
returns integer
language sql
immutable
as $$ select 21 $$;
revoke all on function public.version_base() from public, anon, authenticated;

select 'Práctica previa instalada' as resultado, public.version_base() as version;
