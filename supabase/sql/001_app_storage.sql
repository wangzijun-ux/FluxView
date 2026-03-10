create table if not exists public.app_storage (
  storage_key text primary key,
  storage_value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_storage enable row level security;

drop policy if exists "app_storage_select_demo" on public.app_storage;
create policy "app_storage_select_demo"
on public.app_storage
for select
to anon, authenticated
using (true);

drop policy if exists "app_storage_insert_demo" on public.app_storage;
create policy "app_storage_insert_demo"
on public.app_storage
for insert
to anon, authenticated
with check (true);

drop policy if exists "app_storage_update_demo" on public.app_storage;
create policy "app_storage_update_demo"
on public.app_storage
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "app_storage_delete_demo" on public.app_storage;
create policy "app_storage_delete_demo"
on public.app_storage
for delete
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.app_storage to anon, authenticated;
