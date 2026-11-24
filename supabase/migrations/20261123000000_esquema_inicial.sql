-- Saldo Claro · esquema inicial
-- Pégalo completo en Supabase → SQL Editor → Run.

create extension if not exists pgcrypto;

-- ---------- Tablas ----------
create table public.hogares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Nuestro hogar',
  codigo text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  reparto_modo text not null default 'ingresos' check (reparto_modo in ('mitad', 'ingresos', 'fijo')),
  reparto_fijo_pct numeric(5,2) not null default 50, -- % que paga quien creó el hogar cuando el modo es 'fijo'
  creado_en timestamptz not null default now()
);

create table public.miembros (
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  color text not null default 'esmeralda' check (color in ('esmeralda', 'rosado')),
  ingreso_mensual numeric(12,2) not null default 0,
  presupuesto_personal numeric(12,2) not null default 0,
  orden smallint not null default 1,
  creado_en timestamptz not null default now(),
  primary key (hogar_id, user_id)
);
create unique index miembros_un_hogar_por_usuario on public.miembros(user_id);

create table public.tarjetas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  ultimos4 text not null default '',
  linea numeric(12,2) not null default 0,
  dia_cierre smallint not null default 25 check (dia_cierre between 1 and 31),
  dia_pago smallint not null default 10 check (dia_pago between 1 and 31),
  color text not null default 'esmeralda',
  creado_en timestamptz not null default now()
);

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  creado_por uuid not null default auth.uid() references auth.users(id),
  tipo text not null check (tipo in ('gasto', 'ingreso')),
  monto numeric(12,2) not null check (monto > 0),
  fecha date not null default current_date,
  hora time,
  comercio text not null default '',
  medio text not null default 'Otro',
  categoria text not null default 'otros',
  nota text not null default '',
  n_operacion text,
  -- de quién es: 'propio' (de duenio) o 'compartido' (de los dos)
  alcance text not null default 'propio' check (alcance in ('propio', 'compartido')),
  duenio uuid references auth.users(id),          -- dueño cuando es propio
  pagado_por uuid references auth.users(id),      -- quién puso el dinero
  privado boolean not null default false,          -- solo lo ve creado_por
  clase text not null default 'normal' check (clase in ('normal', 'pago_tarjeta', 'saldo_pareja', 'aporte_meta')),
  tarjeta_id uuid references public.tarjetas(id) on delete set null,
  meta_id uuid,
  captura_path text,
  creado_en timestamptz not null default now()
);
create index movimientos_hogar_fecha on public.movimientos(hogar_id, fecha desc);
create unique index movimientos_operacion_unica on public.movimientos(hogar_id, n_operacion)
  where n_operacion is not null and n_operacion <> '';

create table public.cuotas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  tarjeta_id uuid not null references public.tarjetas(id) on delete cascade,
  descripcion text not null,
  monto_cuota numeric(12,2) not null,
  total_cuotas smallint not null check (total_cuotas > 0),
  cuotas_pagadas smallint not null default 0,
  creado_en timestamptz not null default now()
);

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  nombre text not null,
  objetivo numeric(12,2) not null check (objetivo > 0),
  fecha_meta date,
  creado_en timestamptz not null default now()
);
alter table public.movimientos add constraint movimientos_meta_fk
  foreign key (meta_id) references public.metas(id) on delete set null;

create table public.presupuestos (
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  categoria text not null,
  monto numeric(12,2) not null check (monto >= 0),
  primary key (hogar_id, categoria)
);

create table public.pagos_fijos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  nombre text not null,
  monto numeric(12,2) not null,
  dia_vence smallint not null check (dia_vence between 1 and 31),
  responsable uuid references auth.users(id),   -- null = los dos
  categoria text not null default 'casa',
  ultimo_pago date,
  creado_en timestamptz not null default now()
);

create table public.cierres (
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  mes date not null,           -- primer día del mes
  user_id uuid not null references auth.users(id) on delete cascade,
  revisado_en timestamptz not null default now(),
  primary key (hogar_id, mes, user_id)
);

-- ---------- Acceso por la API (por si el proyecto no lo da automáticamente) ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------- Permisos (RLS) ----------
create or replace function public.es_miembro(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where hogar_id = h and user_id = auth.uid());
$$;

alter table public.hogares enable row level security;
alter table public.miembros enable row level security;
alter table public.tarjetas enable row level security;
alter table public.movimientos enable row level security;
alter table public.cuotas enable row level security;
alter table public.metas enable row level security;
alter table public.presupuestos enable row level security;
alter table public.pagos_fijos enable row level security;
alter table public.cierres enable row level security;

create policy "ver mi hogar" on public.hogares for select using (public.es_miembro(id));
create policy "editar mi hogar" on public.hogares for update using (public.es_miembro(id));

create policy "ver miembros" on public.miembros for select using (public.es_miembro(hogar_id));
create policy "editar mi perfil" on public.miembros for update using (user_id = auth.uid());

create policy "ver movimientos" on public.movimientos for select
  using (public.es_miembro(hogar_id) and (not privado or creado_por = auth.uid()));
create policy "crear movimientos" on public.movimientos for insert
  with check (public.es_miembro(hogar_id) and creado_por = auth.uid());
create policy "editar movimientos" on public.movimientos for update
  using (public.es_miembro(hogar_id) and (not privado or creado_por = auth.uid()));
create policy "borrar movimientos" on public.movimientos for delete
  using (public.es_miembro(hogar_id) and (not privado or creado_por = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['tarjetas', 'cuotas', 'metas', 'presupuestos', 'pagos_fijos', 'cierres'] loop
    execute format('create policy "hogar %1$s" on public.%1$I for all using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id))', t);
  end loop;
end $$;

-- ---------- Crear o unirse a un hogar ----------
create or replace function public.crear_hogar(mi_nombre text, nombre_hogar text default 'Nuestro hogar')
returns public.hogares language plpgsql security definer set search_path = public as $$
declare h public.hogares;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if exists (select 1 from public.miembros where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;
  insert into public.hogares (nombre) values (coalesce(nullif(trim(nombre_hogar), ''), 'Nuestro hogar')) returning * into h;
  insert into public.miembros (hogar_id, user_id, nombre, color, orden) values (h.id, auth.uid(), trim(mi_nombre), 'esmeralda', 1);
  insert into public.presupuestos (hogar_id, categoria, monto) values
    (h.id, 'comida', 600), (h.id, 'casa', 1400), (h.id, 'ocio', 300);
  return h;
end $$;

create or replace function public.unirse_hogar(codigo_in text, mi_nombre text)
returns public.hogares language plpgsql security definer set search_path = public as $$
declare h public.hogares;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if exists (select 1 from public.miembros where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;
  select * into h from public.hogares where codigo = upper(trim(codigo_in));
  if h.id is null then raise exception 'No encontramos ese código. Revísalo con tu pareja.'; end if;
  if (select count(*) from public.miembros where hogar_id = h.id) >= 2 then
    raise exception 'Este hogar ya tiene dos personas';
  end if;
  insert into public.miembros (hogar_id, user_id, nombre, color, orden) values (h.id, auth.uid(), trim(mi_nombre), 'rosado', 2);
  return h;
end $$;

grant execute on function public.crear_hogar(text, text) to authenticated;
grant execute on function public.unirse_hogar(text, text) to authenticated;

-- ---------- Capturas (Storage) ----------
insert into storage.buckets (id, name, public) values ('capturas', 'capturas', false)
on conflict (id) do nothing;

create policy "capturas: ver" on storage.objects for select
  using (bucket_id = 'capturas' and public.es_miembro(((storage.foldername(name))[1])::uuid));
create policy "capturas: subir" on storage.objects for insert
  with check (bucket_id = 'capturas' and public.es_miembro(((storage.foldername(name))[1])::uuid));
create policy "capturas: borrar" on storage.objects for delete
  using (bucket_id = 'capturas' and public.es_miembro(((storage.foldername(name))[1])::uuid));
