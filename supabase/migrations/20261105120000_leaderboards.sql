-- Leaderboards with pseudonyms (js/leaderboard.js). The browser reaches all of this only through the functions below: they
-- check a run, and they hand out names and times but never an account's id or email.
-- What is checked is plausibility, not proof: the game's clock and physics run in the browser. A bad entry is removed by
-- hand in the dashboard (delete from public.scores where ...).

-- One list per mission. A change to a mission's balance gets a new id (ski-slalom-2) and the old one ranked = false.
-- min_ms: the fastest possible time without penalties (course length at the top speed, with room for a cut corner)
create table public.boards (
  id      text primary key,
  mission text not null,
  min_ms  integer not null,
  max_ms  integer not null,
  ranked  boolean not null default true,
  constraint boards_limits check (0 < min_ms and min_ms < max_ms)
);

insert into public.boards (id, mission, min_ms, max_ms) values
  ('ski-slalom-1', 'ski-slalom', 25000, 1800000),
  ('mtb-race-1', 'mtb-race', 120000, 1800000),
  ('speed-skating-1', 'speed-skating', 40000, 1800000);

create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  constraint profiles_name_shape check (name ~ '^[A-Za-z0-9ÄÖÜäöüÉÈÊËÀÂÇÑéèêëàâçñïîôûùß][A-Za-z0-9ÄÖÜäöüÉÈÊËÀÂÇÑéèêëàâçñïîôûùß _-]{1,18}[A-Za-z0-9ÄÖÜäöüÉÈÊËÀÂÇÑéèêëàâçñïîôûùß]$')
);
create unique index profiles_name_unique on public.profiles (lower(name));

-- One open run per player and list: a restart replaces it, so the table stays small and every accepted time took real time
create table public.run_starts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  board_id   text not null references public.boards (id) on delete cascade,
  started_at timestamptz not null default now(),
  unique (user_id, board_id)
);

create table public.scores (
  user_id     uuid not null references auth.users (id) on delete cascade,
  board_id    text not null references public.boards (id) on delete cascade,
  total_ms    integer not null,
  penalty_ms  integer not null,
  achieved_at timestamptz not null default now(),
  primary key (user_id, board_id)
);
create index scores_board_order on public.scores (board_id, total_ms, achieved_at);

alter table public.boards enable row level security;
alter table public.profiles enable row level security;
alter table public.run_starts enable row level security;
alter table public.scores enable row level security;
revoke all on table public.boards, public.profiles, public.run_starts, public.scores from public, anon, authenticated;

-- The player's name, made on first need
create function public.ensure_profile(uid uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  words constant text[] := array['Steinbock', 'Murmeltier', 'Bergdohle', 'Schneehase', 'Gämse', 'Luchs', 'Bartgeier', 'Birkhahn', 'Arve', 'Enzian'];
  picked text;
begin
  select p.name into picked from public.profiles p where p.user_id = uid;
  if found then return picked; end if;
  for attempt in 1..20 loop
    picked := words[1 + floor(random() * array_length(words, 1))::integer] || '-' || (1000 + floor(random() * 9000))::integer;
    begin
      insert into public.profiles (user_id, name) values (uid, picked);
      return picked;
    exception when unique_violation then
      select p.name into picked from public.profiles p where p.user_id = uid; -- (another device of this player, just now)
      if found then return picked; end if;
    end;
  end loop;
  raise exception 'no free name';
end $$;

create function public.my_profile() returns text
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  return public.ensure_profile(auth.uid());
end $$;

-- Answers { name } or { error: 'invalid' | 'taken' }
create function public.set_player_name(new_name text) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
  cleaned constant text := regexp_replace(btrim(coalesce(new_name, '')), '\s+', ' ', 'g');
  blocked constant text[] := array['admin', 'moderator', 'support', 'slopdavos', 'supabase', 'tschopp', 'nazi', 'hitler', 'fuck', 'bitch', 'cunt', 'nigger', 'neger', 'fotze', 'wichser', 'hurensohn', 'schwuchtel'];
  word text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  foreach word in array blocked loop
    if position(word in lower(cleaned)) > 0 then return jsonb_build_object('error', 'invalid'); end if;
  end loop;
  insert into public.profiles (user_id, name) values (uid, cleaned)
    on conflict (user_id) do update set name = excluded.name;
  return jsonb_build_object('name', cleaned);
exception
  when check_violation then return jsonb_build_object('error', 'invalid');
  when unique_violation then return jsonb_build_object('error', 'taken');
end $$;

-- Called before the stopwatch can start. Answers the run's id, or null for a list that is closed or unknown
create function public.start_run(board text) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
  run uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.boards b where b.id = board and b.ranked) then return null; end if;
  insert into public.run_starts (user_id, board_id) values (uid, board)
    on conflict (user_id, board_id) do update set id = gen_random_uuid(), started_at = now()
    returning id into run;
  return run;
end $$;

-- A finished run, once per start. Answers { accepted: true, improved, rank, players, best_ms } or { accepted: false, reason }
create function public.submit_run(run uuid, total_ms integer, penalty_ms integer) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
  grace constant double precision := 5000; -- ms: the start's request may arrive after the first input on a slow network
  started public.run_starts%rowtype;
  list public.boards%rowtype;
  clean integer;
  was_better boolean;
  mine public.scores%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.run_starts s where s.id = run and s.user_id = uid returning * into started;
  if not found then return jsonb_build_object('accepted', false, 'reason', 'unknown_run'); end if;
  select * into list from public.boards b where b.id = started.board_id and b.ranked;
  if not found then return jsonb_build_object('accepted', false, 'reason', 'closed'); end if;
  if now() - started.started_at > interval '6 hours' then return jsonb_build_object('accepted', false, 'reason', 'expired'); end if;
  if total_ms is null or penalty_ms is null or penalty_ms < 0 or total_ms > list.max_ms then
    return jsonb_build_object('accepted', false, 'reason', 'implausible');
  end if;
  clean := total_ms - penalty_ms;
  -- (a penalty adds to the time but was never waited for; claiming more of it cannot pass these checks with a better total)
  if clean < list.min_ms or extract(epoch from now() - started.started_at) * 1000 + grace < clean then
    return jsonb_build_object('accepted', false, 'reason', 'implausible');
  end if;
  perform public.ensure_profile(uid);
  insert into public.scores as s (user_id, board_id, total_ms, penalty_ms) values (uid, list.id, total_ms, penalty_ms)
    on conflict (user_id, board_id) do update
      set total_ms = excluded.total_ms, penalty_ms = excluded.penalty_ms, achieved_at = now()
      where excluded.total_ms < s.total_ms;
  was_better := found;
  select * into mine from public.scores s where s.user_id = uid and s.board_id = list.id;
  return jsonb_build_object(
    'accepted', true,
    'improved', was_better,
    'best_ms', mine.total_ms,
    'rank', (select count(*) + 1 from public.scores s where s.board_id = list.id and (s.total_ms, s.achieved_at) < (mine.total_ms, mine.achieved_at)),
    'players', (select count(*) from public.scores s where s.board_id = list.id)
  );
end $$;

-- The top of a list, plus the asking player's own line
create function public.board_top(board text, how_many integer default 10)
  returns table (place integer, name text, total_ms integer, is_me boolean, players integer)
  language sql stable security definer set search_path = '' as $$
  with ranked as (
    select s.user_id, p.name, s.total_ms,
      row_number() over (order by s.total_ms, s.achieved_at) as place,
      count(*) over () as players
    from public.scores s join public.profiles p on p.user_id = s.user_id
    where s.board_id = board
  )
  select r.place::integer, r.name, r.total_ms, coalesce(r.user_id = auth.uid(), false), r.players::integer
  from ranked r
  where r.place <= least(greatest(coalesce(how_many, 10), 1), 50) or r.user_id = auth.uid()
  order by r.place;
$$;

revoke all on function public.ensure_profile(uuid) from public, anon, authenticated;
revoke all on function public.my_profile() from public, anon;
revoke all on function public.set_player_name(text) from public, anon;
revoke all on function public.start_run(text) from public, anon;
revoke all on function public.submit_run(uuid, integer, integer) from public, anon;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.set_player_name(text) to authenticated;
grant execute on function public.start_run(text) to authenticated;
grant execute on function public.submit_run(uuid, integer, integer) to authenticated;
grant execute on function public.board_top(text, integer) to anon, authenticated;
