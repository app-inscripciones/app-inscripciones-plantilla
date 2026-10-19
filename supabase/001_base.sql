-- =====================================================================
-- Etapa 2 · Base central
-- Se ejecuta UNA VEZ en el editor SQL de Supabase (SQL Editor → Run).
-- Crea las tablas de eventos e inscripciones, las protege y crea la
-- única "puerta de entrada" para que la app envíe inscripciones.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Eventos (por ahora, los eventos modelo; en la Etapa 4 se crean desde la app)
-- ---------------------------------------------------------------------
create table if not exists public.eventos (
  id                text primary key,
  nombre            text not null,
  fecha             date not null,
  unidad            text not null check (unidad in ('persona', 'pareja')),
  estado            text not null default 'abierto' check (estado in ('borrador', 'abierto', 'cerrado')),
  es_modelo         boolean not null default false,
  definicion        jsonb not null,
  codigo_carga_hash text,           -- huella del código de carga (nunca el código en texto)
  creado_en         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Inscripciones
-- El id lo genera el celular: si llega dos veces, se guarda una sola.
-- ---------------------------------------------------------------------
create table if not exists public.inscripciones (
  id               uuid primary key,
  numero_orden     bigint generated always as identity unique,
  evento_id        text not null references public.eventos (id),
  cargador         text not null check (length(cargador) between 2 and 120),
  dispositivo      text,
  creada_en_local  timestamptz not null,
  dia_carga        date not null,
  recibida_en      timestamptz not null default now(),
  categoria        text,
  datos            jsonb not null,
  conceptos        jsonb not null,
  monto            integer not null check (monto >= 0),
  medio_pago       text not null check (medio_pago in ('efectivo', 'terminal', 'transferencia')),
  banco            text,
  ultimos6         text check (ultimos6 ~ '^[A-Z0-9]{6}$'),
  estado           text not null default 'activa' check (estado in ('activa', 'anulada', 'posible_duplicado')),
  duplicado_de     uuid references public.inscripciones (id),
  constraint transferencia_completa check (medio_pago <> 'transferencia' or (banco is not null and ultimos6 is not null))
);

create index if not exists inscripciones_evento_idx on public.inscripciones (evento_id);
create index if not exists inscripciones_cargador_idx on public.inscripciones (evento_id, cargador);

-- ---------------------------------------------------------------------
-- Seguridad: nadie puede leer ni escribir las tablas directamente.
-- La app solo puede usar las funciones de abajo.
-- ---------------------------------------------------------------------
alter table public.eventos enable row level security;
alter table public.inscripciones enable row level security;
revoke all on public.eventos, public.inscripciones from anon, authenticated;
revoke all on sequence public.inscripciones_numero_orden_seq from anon, authenticated;

-- Huella de un código (sha256 en hexadecimal)
create or replace function public.huella_codigo(p_codigo text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(upper(trim(coalesce(p_codigo, ''))), 'sha256'), 'hex');
$$;
revoke all on function public.huella_codigo(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- verificar_codigo: la app lo usa para avisar enseguida si el código está mal.
-- ---------------------------------------------------------------------
create or replace function public.verificar_codigo(p_evento text, p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.eventos
    where id = p_evento and estado = 'abierto'
      and codigo_carga_hash = public.huella_codigo(p_codigo)
  );
$$;
revoke all on function public.verificar_codigo(text, text) from public;
grant execute on function public.verificar_codigo(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- recibir_inscripcion: la única puerta de entrada de inscripciones.
--  · Controla que el evento exista, esté abierto y que el código sea correcto.
--  · Si la inscripción ya había llegado (mismo id), no la repite.
--  · Si ya hay otra activa con el mismo DNI (o teléfono, si el evento no pide DNI),
--    la guarda igual pero marcada como «posible duplicado» para que la revise un organizador.
-- Devuelve: { ok, numeroOrden, repetida, posibleDuplicado } o { ok:false, error }.
-- ---------------------------------------------------------------------
create or replace function public.recibir_inscripcion(p_codigo text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_evento     public.eventos;
  v_id         uuid;
  v_nro        bigint;
  v_clave      text;
  v_dup        uuid;
begin
  if p is null or length(p::text) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;

  select * into v_evento from public.eventos where id = p->>'eventoId';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'evento_inexistente');
  end if;
  if v_evento.estado <> 'abierto' then
    return jsonb_build_object('ok', false, 'error', 'evento_cerrado');
  end if;
  if v_evento.codigo_carga_hash is null or v_evento.codigo_carga_hash <> public.huella_codigo(p_codigo) then
    return jsonb_build_object('ok', false, 'error', 'codigo_invalido');
  end if;

  begin
    v_id := (p->>'id')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end;

  -- Ya había llegado: se responde lo mismo, sin duplicar.
  select numero_orden into v_nro from public.inscripciones where id = v_id;
  if found then
    return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', true);
  end if;

  -- Posible duplicado de persona (no impide guardar).
  v_clave := coalesce(
    nullif(regexp_replace(coalesce(p->'datos'->>'dni', ''), '\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(p->'datos'->>'telefono', ''), '\D', '', 'g'), '')
  );
  if v_clave is not null then
    select i.id into v_dup
    from public.inscripciones i
    where i.evento_id = v_evento.id
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
      datos, conceptos, monto, medio_pago, banco, ultimos6, estado, duplicado_de
    ) values (
      v_id,
      v_evento.id,
      trim(p->>'cargador'),
      p->>'dispositivo',
      (p->>'creadaEn')::timestamptz,
      (p->>'diaCarga')::date,
      nullif(p->>'categoria', ''),
      coalesce(p->'datos', '{}'::jsonb),
      coalesce(p->'conceptos', '[]'::jsonb),
      (p->>'monto')::integer,
      p->'pago'->>'medio',
      nullif(trim(p->'pago'->>'banco'), ''),
      nullif(p->'pago'->>'ultimos6', ''),
      case when v_dup is null then 'activa' else 'posible_duplicado' end,
      v_dup
    )
    on conflict (id) do nothing
    returning numero_orden into v_nro;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end;

  if v_nro is null then  -- llegó dos veces al mismo tiempo
    select numero_orden into v_nro from public.inscripciones where id = v_id;
    return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', true);
  end if;

  return jsonb_build_object('ok', true, 'numeroOrden', v_nro, 'repetida', false, 'posibleDuplicado', v_dup is not null);
end;
$$;
revoke all on function public.recibir_inscripcion(text, jsonb) from public;
grant execute on function public.recibir_inscripcion(text, jsonb) to anon, authenticated;
