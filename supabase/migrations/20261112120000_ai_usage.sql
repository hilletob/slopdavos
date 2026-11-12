-- The personal line in a mission's briefing and at its end (supabase/functions/mission-text, js/personal-text.js): written
-- by a language model, so every call costs. A signed-in player gets PLAYER_DAY of them a day, all players together
-- ALL_DAY; the function asks ai_take() before each call and gets, with the go-ahead, what it may tell the model about the
-- player: the leaderboard name, the progress and the play statistics. Never the account's id or email.

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   integer not null default 0,
  primary key (user_id, day)
);
create index ai_usage_day on public.ai_usage (day);

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from public, anon, authenticated;

-- Answers { allowed: true, name, progress, stats } and counts the call, or { allowed: false, reason: 'quota' | 'busy' }
create function public.ai_take() returns jsonb
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
      'stats', coalesce(s.stats, '{}'::jsonb))
    into answer
    from (select uid as id) me left join public.saves s on s.user_id = me.id;
  return answer;
end $$;

revoke all on function public.ai_take() from public, anon;
grant execute on function public.ai_take() to authenticated;
