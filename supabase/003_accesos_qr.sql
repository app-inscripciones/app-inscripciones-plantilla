-- =====================================================================
-- Etapa 3 · Accesos temporales con QR
-- Se ejecuta UNA VEZ en el editor SQL de Supabase (SQL Editor → Run),
-- después de 001 y 002. Se puede volver a ejecutar sin problemas.
--
--  · Colaboradores: las personas voluntarias (cargadores y control de presentes).
--  · Accesos: cada QR. Vale para un evento, una tarea y un horario.
--  · Sesiones: cada celular que activó un QR. Recibe una "llave" propia
--    (la base guarda solo su huella) con la que envía lo que carga.
--  · Funciones del organizador, protegidas por la clave de organizador
--    (provisorio hasta el ingreso con usuario de la Etapa 4).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ajustes generales (por ahora, solo la huella de la clave de organizador)
-- ---------------------------------------------------------------------
create table if not exists public.ajustes (
  clave  text primary key,
  valor  text not null
);

create table if not exists public.colaboradores (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique check (length(nombre) between 2 and 120),
  creado_en timestamptz not null default now()
);

create table if not exists public.accesos (
  id              uuid primary key default gen_random_uuid(),
  evento_id       text not null references public.eventos (id),
  colaborador_id  uuid not null references public.colaboradores (id),
  tarea           text not null check (tarea in ('cargar', 'presentes')),
  desde           timestamptz not null,
  hasta           timestamptz not null,
  codigo_hash     text not null unique,     -- huella del código del QR (nunca el código)
  max_dispositivos integer not null default 1 check (max_dispositivos between 1 and 5),
  creado_en       timestamptz not null default now(),
  cerrado_en      timestamptz,
  constraint horario_valido check (hasta > desde)
);
create index if not exists accesos_evento_idx on public.accesos (evento_id);

create table if not exists public.sesiones (
  id               uuid primary key default gen_random_uuid(),
  acceso_id        uuid not null references public.accesos (id),
  dispositivo      text not null,
  token_hash       text not null unique,    -- huella de la llave del celular
  activada_en      timestamptz not null default now(),
  ultima_conexion  timestamptz not null default now(),
  unique (acceso_id, dispositivo)
);

-- Inscripciones: de qué sesión vinieron y si llegaron fuera de horario.
alter table public.inscripciones add column if not exists sesion_id uuid references public.sesiones (id);
alter table public.inscripciones add column if not exists fuera_de_horario boolean not null default false;

-- Nadie lee ni escribe estas tablas directamente: solo a través de las funciones.
alter table public.ajustes enable row level security;
alter table public.colaboradores enable row level security;
alter table public.accesos enable row level security;
alter table public.sesiones enable row level security;
revoke all on public.ajustes, public.colaboradores, public.accesos, public.sesiones from anon, authenticated;

-- El código del evento de la Etapa 2 deja de valer: ahora se entra con QR.
update public.eventos set codigo_carga_hash = null;
revoke execute on function public.verificar_codigo(text, text) from anon, authenticated;
revoke execute on function public.recibir_inscripcion(text, jsonb) from anon, authenticated;

-- ---------------------------------------------------------------------
-- Clave de organizador (provisoria). Solo se fija desde el editor SQL:
--   select public.fijar_clave_organizador('una clave larga que elijas');
-- ---------------------------------------------------------------------
create or replace function public.fijar_clave_organizador(p_clave text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_clave is null or length(trim(p_clave)) < 12 then
    raise exception 'La clave tiene que tener al menos 12 caracteres.';
  end if;
  insert into public.ajustes (clave, valor)
  values ('clave_organizador', public.huella_codigo(p_clave))
  on conflict (clave) do update set valor = excluded.valor;
  return 'Clave de organizador guardada.';
end;
$$;
revoke all on function public.fijar_clave_organizador(text) from public, anon, authenticated;

create or replace function public.clave_organizador_ok(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.ajustes
    where clave = 'clave_organizador' and valor = public.huella_codigo(p_clave)
  );
$$;
revoke all on function public.clave_organizador_ok(text) from public, anon, authenticated;

-- Código corto legible para el QR: 8 caracteres sin letras confusas (sin 0/O, 1/I/L).
create or replace function public.nuevo_codigo_corto()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(8);
  r text := '';
begin
  for i in 0..7 loop
    r := r || substr(alfabeto, (get_byte(b, i) % length(alfabeto)) + 1, 1);
  end loop;
  return substr(r, 1, 4) || '-' || substr(r, 5, 4);
end;
$$;
revoke all on function public.nuevo_codigo_corto() from public, anon, authenticated;

-- Normaliza el código: mayúsculas, sin espacios; acepta con o sin guion.
create or replace function public.huella_acceso(p_codigo text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select public.huella_codigo(regexp_replace(upper(coalesce(p_codigo, '')), '[^A-Z0-9]', '', 'g'));
$$;
revoke all on function public.huella_acceso(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- ORGANIZADOR · org_datos: eventos abiertos, colaboradores y accesos.
-- ---------------------------------------------------------------------
create or replace function public.org_datos(p_clave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.clave_organizador_ok(p_clave) then
    return jsonb_build_object('ok', false, 'error', 'clave_invalida');
  end if;
  return jsonb_build_object(
    'ok', true,
    'ahora', now(),
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'fecha', e.fecha) order by e.fecha)
      from public.eventos e where e.estado = 'abierto'), '[]'::jsonb),
    'colaboradores', coalesce((
      select jsonb_agg(c.nombre order by c.nombre) from public.colaboradores c), '[]'::jsonb),
    'accesos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'eventoId', a.evento_id, 'colaborador', c.nombre, 'tarea', a.tarea,
        'desde', a.desde, 'hasta', a.hasta, 'cerradoEn', a.cerrado_en, 'creadoEn', a.creado_en,
        'dispositivos', (select count(*) from public.sesiones s where s.acceso_id = a.id),
        'ultimaConexion', (select max(s.ultima_conexion) from public.sesiones s where s.acceso_id = a.id),
        'inscripciones', (select count(*) from public.inscripciones i
                          join public.sesiones s on s.id = i.sesion_id where s.acceso_id = a.id)
      ) order by a.creado_en desc)
      from public.accesos a join public.colaboradores c on c.id = a.colaborador_id
      where a.hasta > now() - interval '30 days'), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.org_datos(text) from public;
grant execute on function public.org_datos(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- ORGANIZADOR · org_crear_acceso: crea un QR. Devuelve el código UNA sola vez.
-- ---------------------------------------------------------------------
create or replace function public.org_crear_acceso(
  p_clave text, p_evento text, p_nombre text, p_tarea text, p_desde timestamptz, p_hasta timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_colab  uuid;
  v_codigo text;
  v_id     uuid;
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if not public.clave_organizador_ok(p_clave) then
    return jsonb_build_object('ok', false, 'error', 'clave_invalida');
  end if;
  if not exists (select 1 from public.eventos where id = p_evento and estado = 'abierto') then
    return jsonb_build_object('ok', false, 'error', 'evento_cerrado');
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 120 then
    return jsonb_build_object('ok', false, 'error', 'nombre_invalido');
  end if;
  if p_tarea not in ('cargar', 'presentes') then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde or p_hasta <= now()
     or p_hasta - p_desde > interval '7 days' then
    return jsonb_build_object('ok', false, 'error', 'horario_invalido');
  end if;

  insert into public.colaboradores (nombre) values (v_nombre)
  on conflict (nombre) do update set nombre = excluded.nombre
  returning id into v_colab;

  loop
    v_codigo := public.nuevo_codigo_corto();
    begin
      insert into public.accesos (evento_id, colaborador_id, tarea, desde, hasta, codigo_hash)
      values (p_evento, v_colab, p_tarea, p_desde, p_hasta, public.huella_acceso(v_codigo))
      returning id into v_id;
      exit;
    exception when unique_violation then
      -- código repetido (muy improbable): se genera otro
    end;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo);
end;
$$;
revoke all on function public.org_crear_acceso(text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.org_crear_acceso(text, text, text, text, timestamptz, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------
-- ORGANIZADOR · org_cerrar_acceso: cierre manual de un QR.
-- ---------------------------------------------------------------------
create or replace function public.org_cerrar_acceso(p_clave text, p_acceso uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.clave_organizador_ok(p_clave) then
    return jsonb_build_object('ok', false, 'error', 'clave_invalida');
  end if;
  update public.accesos set cerrado_en = coalesce(cerrado_en, now()) where id = p_acceso;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'acceso_inexistente');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.org_cerrar_acceso(text, uuid) from public;
grant execute on function public.org_cerrar_acceso(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- COLABORADOR · activar_acceso: el celular presenta el código del QR.
--  · Controla que el QR exista, no esté cerrado ni vencido y que el evento esté abierto.
--  · Un QR sirve para un solo celular (el mismo celular puede volver a activarlo).
--  · Devuelve la llave del celular y todo lo necesario para trabajar sin internet.
-- ---------------------------------------------------------------------
create or replace function public.activar_acceso(p_codigo text, p_dispositivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_acc    public.accesos;
  v_ev     public.eventos;
  v_nombre text;
  v_token  text;
  v_sesion uuid;
begin
  if p_dispositivo is null or length(p_dispositivo) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  select * into v_acc from public.accesos where codigo_hash = public.huella_acceso(p_codigo);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'codigo_invalido');
  end if;
  if v_acc.cerrado_en is not null then
    return jsonb_build_object('ok', false, 'error', 'acceso_cerrado');
  end if;
  if v_acc.hasta <= now() then
    return jsonb_build_object('ok', false, 'error', 'acceso_vencido');
  end if;
  select * into v_ev from public.eventos where id = v_acc.evento_id;
  if v_ev.estado <> 'abierto' then
    return jsonb_build_object('ok', false, 'error', 'evento_cerrado');
  end if;
  if not exists (select 1 from public.sesiones where acceso_id = v_acc.id and dispositivo = p_dispositivo)
     and (select count(*) from public.sesiones where acceso_id = v_acc.id) >= v_acc.max_dispositivos then
    return jsonb_build_object('ok', false, 'error', 'ya_activado');
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.sesiones (acceso_id, dispositivo, token_hash)
  values (v_acc.id, p_dispositivo, public.huella_codigo(v_token))
  on conflict (acceso_id, dispositivo)
    do update set token_hash = excluded.token_hash, ultima_conexion = now()
  returning id into v_sesion;

  select nombre into v_nombre from public.colaboradores where id = v_acc.colaborador_id;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'sesionId', v_sesion,
    'tarea', v_acc.tarea,
    'colaborador', v_nombre,
    'desde', v_acc.desde,
    'hasta', v_acc.hasta,
    'evento', v_ev.definicion || jsonb_build_object('id', v_ev.id, 'nombre', v_ev.nombre, 'fecha', v_ev.fecha, 'unidad', v_ev.unidad)
  );
end;
$$;
revoke all on function public.activar_acceso(text, text) from public;
grant execute on function public.activar_acceso(text, text) to anon, authenticated;

-- Busca la sesión de una llave (uso interno).
create or replace function public.sesion_de_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select id from public.sesiones where token_hash = public.huella_codigo(p_token);
$$;
revoke all on function public.sesion_de_token(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- COLABORADOR · estado_sesion: el celular pregunta si su acceso sigue vigente
-- (así se entera de un cierre manual o de un cambio de horario).
-- ---------------------------------------------------------------------
create or replace function public.estado_sesion(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ses uuid := public.sesion_de_token(p_token);
  v_acc public.accesos;
begin
  if v_ses is null then
    return jsonb_build_object('ok', false, 'error', 'sesion_invalida');
  end if;
  update public.sesiones set ultima_conexion = now() where id = v_ses;
  select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
  return jsonb_build_object('ok', true, 'ahora', now(), 'desde', v_acc.desde, 'hasta', v_acc.hasta, 'cerradoEn', v_acc.cerrado_en);
end;
$$;
revoke all on function public.estado_sesion(text) from public;
grant execute on function public.estado_sesion(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- COLABORADOR · enviar_inscripcion: la única puerta de entrada de inscripciones (Etapa 3).
--  · Se identifica con la llave del celular (no con un código del evento).
--  · El evento y el nombre del cargador salen del acceso, no de lo que mande el celular.
--  · Si la inscripción se cargó fuera del horario del acceso (o después de un cierre manual),
--    se GUARDA igual, marcada «fuera de horario», para que la revise un organizador (D38).
--  · Se aceptan envíos después del horario: es el «modo solo envío» de lo pendiente.
--  · Mismo control de duplicados que en la Etapa 2.
-- ---------------------------------------------------------------------
create or replace function public.enviar_inscripcion(p_token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ses     uuid;
  v_acc     public.accesos;
  v_ev      public.eventos;
  v_cargador text;
  v_id      uuid;
  v_nro     bigint;
  v_clave   text;
  v_dup     uuid;
  v_creada  timestamptz;
  v_fuera   boolean;
  margen    constant interval := interval '10 minutes';
begin
  if p is null or length(p::text) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  v_ses := public.sesion_de_token(p_token);
  if v_ses is null then
    return jsonb_build_object('ok', false, 'error', 'sesion_invalida');
  end if;
  select a.* into v_acc from public.accesos a join public.sesiones s on s.acceso_id = a.id where s.id = v_ses;
  if v_acc.tarea <> 'cargar' then
    return jsonb_build_object('ok', false, 'error', 'sin_permiso');
  end if;
  update public.sesiones set ultima_conexion = now() where id = v_ses;
  select * into v_ev from public.eventos where id = v_acc.evento_id;
  select nombre into v_cargador from public.colaboradores where id = v_acc.colaborador_id;

  begin
    v_id := (p->>'id')::uuid;
    v_creada := (p->>'creadaEn')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end;

  select numero_orden into v_nro from public.inscripciones where id = v_id;
  if found then
    return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', true);
  end if;

  v_fuera := v_creada < v_acc.desde - margen
          or v_creada > least(v_acc.hasta, coalesce(v_acc.cerrado_en, v_acc.hasta)) + margen
          or v_creada > now() + margen;

  v_clave := coalesce(
    nullif(regexp_replace(coalesce(p->'datos'->>'dni', ''), '\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(p->'datos'->>'telefono', ''), '\D', '', 'g'), '')
  );
  if v_clave is not null then
    select i.id into v_dup
    from public.inscripciones i
    where i.evento_id = v_ev.id
      and i.estado <> 'anulada'
      and coalesce(
            nullif(regexp_replace(coalesce(i.datos->>'dni', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(i.datos->>'telefono', ''), '\D', '', 'g'), '')
          ) = v_clave
    order by i.numero_orden
    limit 1;
  end if;

  begin
    insert into public.inscripciones (
      id, evento_id, cargador, dispositivo, creada_en_local, dia_carga, categoria,
      datos, conceptos, monto, medio_pago, banco, ultimos6, estado, duplicado_de,
      sesion_id, fuera_de_horario
    ) values (
      v_id, v_ev.id, v_cargador, p->>'dispositivo', v_creada, (p->>'diaCarga')::date,
      nullif(p->>'categoria', ''),
      coalesce(p->'datos', '{}'::jsonb), coalesce(p->'conceptos', '[]'::jsonb),
      (p->>'monto')::integer, p->'pago'->>'medio',
      nullif(trim(p->'pago'->>'banco'), ''), nullif(p->'pago'->>'ultimos6', ''),
      case when v_dup is null then 'activa' else 'posible_duplicado' end, v_dup,
      v_ses, v_fuera
    )
    on conflict (id) do nothing
    returning numero_orden into v_nro;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end;

  if v_nro is null then
    select numero_orden into v_nro from public.inscripciones where id = v_id;
    return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', true);
  end if;

  return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', false,
                            'posibleDuplicado', v_dup is not null, 'fueraDeHorario', v_fuera);
end;
$$;
revoke all on function public.enviar_inscripcion(text, jsonb) from public;
grant execute on function public.enviar_inscripcion(text, jsonb) to anon, authenticated;

-- Para revisar: debe decir «Etapa 3 instalada».
select 'Etapa 3 instalada' as resultado,
       (select count(*) from public.eventos where estado = 'abierto') as eventos_abiertos,
       exists (select 1 from public.ajustes where clave = 'clave_organizador') as clave_organizador_fijada;
