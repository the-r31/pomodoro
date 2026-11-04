-- Run once in this project's Supabase SQL Editor.
-- Personal sync only. This does not enable team access.
begin;

create table if not exists public.pomodoro_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  constraint pomodoro_sync_size check (octet_length(data::text) <= 4194304)
);

alter table public.pomodoro_sync enable row level security;
revoke all on public.pomodoro_sync from public, anon, authenticated;
grant select, insert, update on public.pomodoro_sync to authenticated;

drop policy if exists "Read own workspace" on public.pomodoro_sync;
create policy "Read own workspace" on public.pomodoro_sync for select
  to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Create own workspace" on public.pomodoro_sync;
create policy "Create own workspace" on public.pomodoro_sync for insert
  to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own workspace" on public.pomodoro_sync;
create policy "Update own workspace" on public.pomodoro_sync for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Enforce monotonically increasing revisions even for stale clients.
create or replace function public.pomodoro_sync_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1;
  else
    NEW.revision := OLD.revision + 1;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;
revoke all on function public.pomodoro_sync_revision() from public, anon, authenticated;
drop trigger if exists pomodoro_sync_revision on public.pomodoro_sync;
create trigger pomodoro_sync_revision before insert or update on public.pomodoro_sync
for each row execute function public.pomodoro_sync_revision();

commit;

-- Verify: RLS must be true; only authenticated SELECT/INSERT/UPDATE grants.
select relname, relrowsecurity from pg_class
where oid = 'public.pomodoro_sync'::regclass;
select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'pomodoro_sync';
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pomodoro_sync'
  and grantee in ('anon', 'authenticated');
