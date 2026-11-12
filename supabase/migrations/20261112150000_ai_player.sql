-- What the missions' writer remembers of a player from one text to the next (supabase/functions/mission-text): a few
-- lines of its own notes, e.g. how the player likes to get about or what they are good at. The function reads them with
-- ai_take() and writes them back with ai_note(); the browser has no use for either and never sees the notes.
-- Deleted with the account (on delete cascade).

create table public.ai_players (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  notes      text not null default '',
  updated_at timestamptz not null default now(),
  constraint ai_players_notes_size check (char_length(notes) <= 1000)
);

alter table public.ai_players enable row level security;
revoke all on table public.ai_players from public, anon, authenticated;

-- Answers { allowed: true, name, progress, stats, notes } and counts the call, or { allowed: false, reason: 'quota' | 'busy' }
create or replace function public.ai_take() returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
  today constant date := (now() at time zone 'utc')::date;
  player_day constant integer := 60;
  all_day constant integer := 3000;
  mine integer;
  answer jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select coalesce(sum(u.count), 0) from public.ai_usage u where u.day = today) >= all_day then
    return jsonb_build_object('allowed', false, 'reason', 'busy');
  end if;
  insert into public.ai_usage as u (user_id, day, count) values (uid, today, 1)
    on conflict (user_id, day) do update set count = u.count + 1 where u.count < player_day
    returning u.count into mine;
  if mine is null then return jsonb_build_object('allowed', false, 'reason', 'quota'); end if;
  -- (the days before: nothing reads them)
  delete from public.ai_usage u where u.user_id = uid and u.day < today;
  select jsonb_build_object('allowed', true,
      'name', (select p.name from public.profiles p where p.user_id = uid),
      'progress', coalesce(s.progress, '{}'::jsonb),
      'stats', coalesce(s.stats, '{}'::jsonb),
      'notes', coalesce((select a.notes from public.ai_players a where a.user_id = uid), ''))
    into answer
    from (select uid as id) me left join public.saves s on s.user_id = me.id;
  return answer;
end $$;

-- The writer's notes about the player, replaced as a whole (cut to the size the table takes)
create function public.ai_note(new_notes text) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.ai_players as a (user_id, notes) values (uid, left(coalesce(new_notes, ''), 1000))
    on conflict (user_id) do update set notes = excluded.notes, updated_at = now();
end $$;

revoke all on function public.ai_note(text) from public, anon;
grant execute on function public.ai_note(text) to authenticated;
