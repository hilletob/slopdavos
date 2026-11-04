-- Cloud saves of the optional player account (js/account-sync.js) and deleting an account.
-- The browser holds only the public key: these rules are what protects the data.

create table public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  progress   jsonb not null default '{}',
  best_times jsonb not null default '{}',
  world      jsonb,
  world_at   bigint,
  rev        integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint saves_progress_size check (pg_column_size(progress) < 256000),
  constraint saves_best_times_size check (pg_column_size(best_times) < 64000),
  constraint saves_world_size check (world is null or pg_column_size(world) < 64000)
);

alter table public.saves enable row level security;

revoke all on table public.saves from public, anon, authenticated;
grant select, insert, update on table public.saves to authenticated;

create policy "saves: read your own" on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "saves: create your own" on public.saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saves: change your own" on public.saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.saves_touch() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger saves_touch before update on public.saves
  for each row execute function public.saves_touch();

-- Deleting the account removes its save too (on delete cascade)
create function public.delete_account() returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
revoke all on function public.saves_touch() from public, anon, authenticated;
