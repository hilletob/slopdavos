-- A leaderboard for every mission (js/missions-data.js gives each one `board`: <id>-1). A mission judged by points
-- (scoreMode) gets a list of scores, higher first, its time breaking a tie; the others a list of times as before.
-- Limits from the medals (tests/leaderboard.test.mjs checks them): a time list refuses a time under 30 % of gold, a
-- score list a score above 4 × gold or a run under 15 s. Plausibility, not proof, as in 20261105120000_leaderboards.sql.

alter table public.boards
  add column kind text not null default 'time',
  add column max_score integer,
  add constraint boards_kind check (kind in ('time', 'score')),
  add constraint boards_score_limit check ((kind = 'score') = (max_score is not null and max_score > 0));

alter table public.scores add column score integer;

insert into public.boards (id, mission, kind, min_ms, max_ms, max_score) values
  ('dischma-loipe-1', 'dischma-loipe', 'time', 108000, 1800000, null),
  ('rega-rettung-1', 'rega-rettung', 'time', 54000, 1800000, null),
  ('lawinen-sprengen-1', 'lawinen-sprengen', 'time', 36000, 1800000, null),
  ('toeff-unfall-1', 'toeff-unfall', 'time', 126000, 1800000, null),
  ('toeff-unfall-polizei-1', 'toeff-unfall-polizei', 'time', 162000, 1920000, null),
  ('headbang-box-1', 'headbang-box', 'score', 15000, 3600000, 260000),
  ('foosball-la-onda-1', 'foosball-la-onda', 'score', 15000, 3600000, 1800),
  ('gondola-tetris-1', 'gondola-tetris', 'score', 15000, 3600000, 5200),
  ('rhb-driver-1', 'rhb-driver', 'score', 15000, 3600000, 2400),
  ('apres-bolgenschanze-1', 'apres-bolgenschanze', 'score', 15000, 3600000, 260000),
  ('big-air-1', 'big-air', 'score', 15000, 3600000, 800),
  ('hockey-penalty-1', 'hockey-penalty', 'score', 15000, 3600000, 16),
  ('curling-1', 'curling', 'score', 15000, 3600000, 56),
  ('horn-sledge-rinerhorn-1', 'horn-sledge-rinerhorn', 'time', 42000, 1800000, null),
  ('sommerrodelbahn-schatzalp-1', 'sommerrodelbahn-schatzalp', 'time', 15000, 1800000, null),
  ('golf-1', 'golf', 'score', 15000, 3600000, 2400),
  ('beer-delivery-1', 'beer-delivery', 'time', 153000, 1800000, null),
  ('gipfeli-weber-1', 'gipfeli-weber', 'score', 15000, 3600000, 3400),
  ('raclette-kaech-1', 'raclette-kaech', 'score', 15000, 3600000, 6000),
  ('ibex-hunt-1', 'ibex-hunt', 'score', 15000, 3600000, 1600),
  ('squirrel-trail-1', 'squirrel-trail', 'score', 15000, 3600000, 6400),
  ('tennis-hall-1', 'tennis-hall', 'score', 15000, 3600000, 3040),
  ('waterslide-race-1', 'waterslide-race', 'time', 12000, 1800000, null),
  ('paint-kirchner-1', 'paint-kirchner', 'score', 15000, 3600000, 2480),
  ('silberberg-mine-1', 'silberberg-mine', 'score', 15000, 3600000, 2200),
  ('snow-shovel-1', 'snow-shovel', 'time', 50000, 1800000, null),
  ('snow-blower-1', 'snow-blower', 'time', 68000, 1800000, null),
  ('lawn-mowing-1', 'lawn-mowing', 'time', 72000, 1800000, null),
  ('garbage-run-1', 'garbage-run', 'time', 72000, 1800000, null),
  ('alpine-roses-1', 'alpine-roses', 'time', 36000, 1800000, null),
  ('mushroom-hunt-1', 'mushroom-hunt', 'score', 15000, 3600000, 480),
  ('derby-crane-1', 'derby-crane', 'score', 15000, 3600000, 4400),
  ('snow-haul-1', 'snow-haul', 'score', 15000, 3600000, 3400),
  ('davos-nordic-1', 'davos-nordic', 'score', 15000, 3600000, 400),
  ('minigolf-waldhaus-1', 'minigolf-waldhaus', 'score', 15000, 3600000, 172),
  ('ice-minigolf-1', 'ice-minigolf', 'score', 15000, 3600000, 324),
  ('darts-bar-1', 'darts-bar', 'score', 15000, 3600000, 1680),
  ('skate-bowl-1', 'skate-bowl', 'score', 15000, 3600000, 24000),
  ('tbar-attendant-1', 'tbar-attendant', 'score', 15000, 3600000, 160),
  ('wax-hofmaenner-1', 'wax-hofmaenner', 'score', 15000, 3600000, 3200),
  ('parking-marshal-1', 'parking-marshal', 'score', 15000, 3600000, 6400),
  ('shots-ex-bar-1', 'shots-ex-bar', 'score', 15000, 3600000, 4600),
  ('flaemmli-rot-liechtli-1', 'flaemmli-rot-liechtli', 'score', 15000, 3600000, 5000),
  ('pizza-heaven-1', 'pizza-heaven', 'score', 15000, 3600000, 4400),
  ('seilpark-faerich-1', 'seilpark-faerich', 'time', 14000, 1800000, null),
  ('seehofseeli-hockey-1', 'seehofseeli-hockey', 'score', 15000, 3600000, 13),
  ('schwarzhorn-sunrise-1', 'schwarzhorn-sunrise', 'score', 15000, 3600000, 5280),
  ('joeriseen-1', 'joeriseen', 'score', 15000, 3600000, 4640),
  ('nageln-tijuana-1', 'nageln-tijuana', 'score', 15000, 3600000, 4200),
  ('barista-kafi-klatsch-1', 'barista-kafi-klatsch', 'score', 15000, 3600000, 7200),
  ('sehtest-meerkaemper-1', 'sehtest-meerkaemper', 'score', 15000, 3600000, 1280),
  ('schneeprofil-slf-1', 'schneeprofil-slf', 'score', 15000, 3600000, 3200),
  ('wef-escort-1', 'wef-escort', 'score', 15000, 3600000, 10000),
  ('anti-wef-demo-1', 'anti-wef-demo', 'score', 15000, 3600000, 8400),
  ('quad-heldstab-1', 'quad-heldstab', 'time', 57000, 1800000, null),
  ('bio-round-1', 'bio-round', 'score', 15000, 3600000, 900),
  ('snowshoe-junkerboden-1', 'snowshoe-junkerboden', 'score', 15000, 3600000, 2880),
  ('cast-spital-1', 'cast-spital', 'score', 15000, 3600000, 2480),
  ('paraglider-rinerhorn-1', 'paraglider-rinerhorn', 'score', 15000, 3600000, 5600);

-- A time run: only on a time list
create or replace function public.submit_run(run uuid, total_ms integer, penalty_ms integer) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
  grace constant double precision := 5000;
  started public.run_starts%rowtype;
  list public.boards%rowtype;
  clean integer;
  was_better boolean;
  mine public.scores%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.run_starts s where s.id = run and s.user_id = uid returning * into started;
  if not found then return jsonb_build_object('accepted', false, 'reason', 'unknown_run'); end if;
  select * into list from public.boards b where b.id = started.board_id and b.ranked and b.kind = 'time';
  if not found then return jsonb_build_object('accepted', false, 'reason', 'closed'); end if;
  if now() - started.started_at > interval '6 hours' then return jsonb_build_object('accepted', false, 'reason', 'expired'); end if;
  if total_ms is null or penalty_ms is null or penalty_ms < 0 or total_ms > list.max_ms then
    return jsonb_build_object('accepted', false, 'reason', 'implausible');
  end if;
  clean := total_ms - penalty_ms;
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

-- A scored run, once per start: { accepted: true, improved, rank, players, best_score } or { accepted: false, reason }
create function public.submit_score(run uuid, score integer, total_ms integer) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
  grace constant double precision := 5000;
  started public.run_starts%rowtype;
  list public.boards%rowtype;
  was_better boolean;
  mine public.scores%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.run_starts s where s.id = run and s.user_id = uid returning * into started;
  if not found then return jsonb_build_object('accepted', false, 'reason', 'unknown_run'); end if;
  select * into list from public.boards b where b.id = started.board_id and b.ranked and b.kind = 'score';
  if not found then return jsonb_build_object('accepted', false, 'reason', 'closed'); end if;
  if now() - started.started_at > interval '6 hours' then return jsonb_build_object('accepted', false, 'reason', 'expired'); end if;
  if score is null or total_ms is null or score > list.max_score or score < -list.max_score
     or total_ms < list.min_ms or total_ms > list.max_ms
     or extract(epoch from now() - started.started_at) * 1000 + grace < total_ms then
    return jsonb_build_object('accepted', false, 'reason', 'implausible');
  end if;
  perform public.ensure_profile(uid);
  insert into public.scores as s (user_id, board_id, total_ms, penalty_ms, score) values (uid, list.id, total_ms, 0, submit_score.score)
    on conflict (user_id, board_id) do update
      set score = excluded.score, total_ms = excluded.total_ms, achieved_at = now()
      where excluded.score > s.score or (excluded.score = s.score and excluded.total_ms < s.total_ms);
  was_better := found;
  select * into mine from public.scores s where s.user_id = uid and s.board_id = list.id;
  return jsonb_build_object(
    'accepted', true,
    'improved', was_better,
    'best_score', mine.score,
    'rank', (select count(*) + 1 from public.scores s where s.board_id = list.id
      and (-s.score, s.total_ms, s.achieved_at) < (-mine.score, mine.total_ms, mine.achieved_at)),
    'players', (select count(*) from public.scores s where s.board_id = list.id)
  );
end $$;

-- The lists now carry the score too (a time list: null)
drop function public.board_view(text, integer, integer);
create function public.board_view(board text, how_many integer default 10, around integer default 2)
  returns table (place integer, name text, total_ms integer, score integer, is_me boolean, players integer)
  language sql stable security definer set search_path = '' as $$
  with list as (
    select b.kind from public.boards b where b.id = board
  ), ranked as (
    select s.user_id, p.name, s.total_ms, s.score,
      row_number() over (order by case when (select l.kind from list l) = 'score' then -s.score else 0 end, s.total_ms, s.achieved_at) as place,
      count(*) over () as players
    from public.scores s join public.profiles p on p.user_id = s.user_id
    where s.board_id = board
  ), me as (
    select r.place from ranked r where r.user_id = auth.uid()
  )
  select r.place::integer, r.name, r.total_ms, r.score, coalesce(r.user_id = auth.uid(), false), r.players::integer
  from ranked r
  where r.place <= least(greatest(coalesce(how_many, 10), 1), 50)
     or abs(r.place - coalesce((select me.place from me), -1000)) <= least(greatest(coalesce(around, 2), 0), 5)
  order by r.place;
$$;

revoke all on function public.submit_score(uuid, integer, integer) from public, anon;
grant execute on function public.submit_score(uuid, integer, integer) to authenticated;
revoke all on function public.board_view(text, integer, integer) from public;
grant execute on function public.board_view(text, integer, integer) to anon, authenticated;
