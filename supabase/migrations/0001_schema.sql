-- MacroForge: esquema completo da base de dados (Supabase). Idempotente: pode correr outra vez.
-- Aplicado em produção pela Management API; este ficheiro é a fonte de verdade no repositório.

-- ===== Estado da app, um registo por utilizador =====
create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at bigint not null,            -- relógio do cliente (ms): "o mais recente ganha"
  server_updated timestamptz not null default now()
);
alter table public.app_state enable row level security;
drop policy if exists "dono le" on public.app_state;
drop policy if exists "dono escreve" on public.app_state;
drop policy if exists "dono atualiza" on public.app_state;
drop policy if exists "dono apaga" on public.app_state;
create policy "dono le" on public.app_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono escreve" on public.app_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono atualiza" on public.app_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dono apaga" on public.app_state for delete to authenticated using ((select auth.uid()) = user_id);

-- ===== Fotos de progresso: bucket privado, pasta <uid>/ =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 3145728;
drop policy if exists "fotos do dono: ler" on storage.objects;
drop policy if exists "fotos do dono: enviar" on storage.objects;
drop policy if exists "fotos do dono: apagar" on storage.objects;
create policy "fotos do dono: ler" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos do dono: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos do dono: apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===== Quota de leituras de rótulos (só o servidor) =====
create table if not exists public.label_usage (
  user_id uuid not null,                 -- sem FK de propósito: apagar a conta não repõe a quota do dia
  day date not null default current_date,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.label_usage drop constraint if exists label_usage_user_id_fkey;
alter table public.label_usage enable row level security;
create table if not exists public.label_usage_email (
  email_hash text not null, day date not null default current_date, n int not null default 0,
  primary key (email_hash, day)
);
alter table public.label_usage_email enable row level security;
create or replace function public.try_label(p_user uuid, p_user_limit int, p_global_limit int)
returns json language plpgsql security definer set search_path = public, auth, extensions as $fn$
declare u int; g int; e int; h text;
begin
  perform pg_advisory_xact_lock(hashtext('try_label'));
  delete from label_usage where day < current_date - 1;
  delete from label_usage_email where day < current_date - 1;
  select encode(digest(lower(email), 'sha256'), 'hex') into h from auth.users where id = p_user;
  select coalesce(sum(n), 0) into g from label_usage where day = current_date;
  select coalesce(max(n), 0) into u from label_usage where user_id = p_user and day = current_date;
  select coalesce(max(n), 0) into e from label_usage_email where email_hash = h and day = current_date;
  if greatest(u, e) >= p_user_limit then return json_build_object('ok', false, 'reason', 'userLimit', 'used', greatest(u, e)); end if;
  if g >= p_global_limit then return json_build_object('ok', false, 'reason', 'globalLimit', 'used', u); end if;
  insert into label_usage (user_id, day, n) values (p_user, current_date, 1)
    on conflict (user_id, day) do update set n = label_usage.n + 1;
  if h is not null then
    insert into label_usage_email (email_hash, day, n) values (h, current_date, 1)
      on conflict (email_hash, day) do update set n = label_usage_email.n + 1;
  end if;
  return json_build_object('ok', true, 'used', greatest(u, e) + 1);
end $fn$;
revoke all on function public.try_label(uuid, int, int) from public, anon, authenticated;
grant execute on function public.try_label(uuid, int, int) to service_role;

-- ===== Alimentos da comunidade =====
create table if not exists public.shared_foods (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null, -- nunca exposto aos clientes
  name text not null check (char_length(btrim(name)) between 2 and 60),
  cat text not null check (cat in ('prot','protfat','dairy','carb','fat','veg','fruit')),
  k numeric not null check (k between 0 and 950),
  p numeric not null check (p between 0 and 100),
  c numeric not null check (c between 0 and 100),
  f numeric not null check (f between 0 and 100),
  fb numeric not null default 0 check (fb between 0 and 100),
  m text not null default 'BMS' check (m ~ '^[BMS]{1,3}$'),
  unit jsonb, meas jsonb,
  por numeric check (por is null or por between 1 and 2000),
  source text not null default 'manual' check (source in ('label','manual')),
  created_at timestamptz not null default now(),
  constraint macros_possiveis check (p + c + f <= 101)
);
alter table public.shared_foods alter column created_by set default auth.uid();
create unique index if not exists shared_foods_name_uq on public.shared_foods (lower(btrim(name)));

-- Formas permitidas para unit e meas (dados que vão parar ao ecrã de outras pessoas)
create or replace function public.valid_unit(u jsonb) returns boolean language sql immutable as $fn$
  select u is null or (
    jsonb_typeof(u) = 'object'
    and (select count(*) from jsonb_object_keys(u)) <= 3
    and jsonb_typeof(u->'g') = 'number' and (u->>'g')::numeric between 0.5 and 2000
    and coalesce(u->>'pt', '') ~ '^[[:alpha:][:space:]\.\-]{0,20}$'
    and coalesce(u->>'en', '') ~ '^[[:alpha:][:space:]\.\-]{0,20}$'
    and not exists (select 1 from jsonb_object_keys(u) k where k not in ('g','pt','en')))
$fn$;
create or replace function public.valid_meas(m jsonb) returns boolean language sql immutable as $fn$
  select m is null or (
    jsonb_typeof(m) = 'array' and jsonb_array_length(m) <= 6
    and not exists (
      select 1 from jsonb_array_elements(m) e
      where jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2
         or (e->>0) not in ('csopa','ccha','chav','copo','punhado','clara','media','metade','fatia','quadrado')
         or jsonb_typeof(e->1) <> 'number' or (e->>1)::numeric not between 0.5 and 500))
$fn$;
alter table public.shared_foods drop constraint if exists unit_valida;
alter table public.shared_foods add constraint unit_valida check (public.valid_unit(unit));
alter table public.shared_foods drop constraint if exists meas_valida;
alter table public.shared_foods add constraint meas_valida check (public.valid_meas(meas));

alter table public.shared_foods enable row level security;
drop policy if exists "todos com conta veem" on public.shared_foods;
drop policy if exists "criar em nome proprio" on public.shared_foods;
drop policy if exists "so o autor corrige" on public.shared_foods;
drop policy if exists "so o autor apaga" on public.shared_foods;
create policy "todos com conta veem" on public.shared_foods for select to authenticated using (true);
create policy "criar em nome proprio" on public.shared_foods for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "so o autor corrige" on public.shared_foods for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "so o autor apaga" on public.shared_foods for delete to authenticated using ((select auth.uid()) = created_by);

-- created_by escondido: os clientes leem todas as colunas menos essa
revoke select, insert, update on public.shared_foods from anon, authenticated;
grant select (id, name, cat, k, p, c, f, fb, m, unit, meas, por, source, created_at) on public.shared_foods to authenticated;
grant insert (name, cat, k, p, c, f, fb, m, unit, meas, por, source) on public.shared_foods to authenticated;
grant update (name, cat, k, p, c, f, fb, m, unit, meas, por, source) on public.shared_foods to authenticated;
grant delete on public.shared_foods to authenticated;

-- "Quais são meus?" sem revelar o autor dos outros
create or replace function public.my_shared_food_ids() returns setof uuid
language sql stable security definer set search_path = public as $fn$
  select id from public.shared_foods where created_by = auth.uid()
$fn$;
revoke all on function public.my_shared_food_ids() from public, anon;
grant execute on function public.my_shared_food_ids() to authenticated;
