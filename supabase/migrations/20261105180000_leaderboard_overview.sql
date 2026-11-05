-- The leaderboards outside a mission (js/leaderboard-overview.js): every list with the players around the asking one, and
-- an overall list of the missions' points from the cloud saves (public.saves, 20261104120000_saves.sql).
-- The points come from the browser like the save itself: plausible at most, capped at what all the missions are worth.

-- What all the missions together are worth (js/missions-progress.js maxPoints; tests/leaderboard.test.mjs keeps them equal)
-- and one mission's points: FIRST_CLEAR_POINTS plus MEDAL_POINTS
create function public.save_points(progress jsonb) returns integer
  language sql immutable security definer set search_path = '' as $$
  select least(46500, coalesce(sum(250 + case e.value->>'medal' when 'gold' then 500 when 'silver' then 250 when 'bronze' then 100 else 0 end), 0))::integer
  from jsonb_each(case when jsonb_typeof(progress->'missions') = 'object' then progress->'missions' else '{}'::jsonb end) e
  where jsonb_typeof(e.value) = 'object';
$$;

-- Every player with a cloud save gets a name, so the overall list can show them (failing that, the save is still kept)
create function public.saves_profile() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.ensure_profile(new.user_id);
  exception when others then null;
  end;
  return new;
end $$;

create trigger saves_profile after insert on public.saves
  for each row execute function public.saves_profile();

select public.ensure_profile(s.user_id) from public.saves s
  where not exists (select 1 from public.profiles p where p.user_id = s.user_id);

-- The top of a list, the asking player's line and the `around` lines before and after it
create function public.board_view(board text, how_many integer default 10, around integer default 2)
  returns table (place integer, name text, total_ms integer, is_me boolean, players integer)
  language sql stable security definer set search_path = '' as $$
  with ranked as (
    select s.user_id, p.name, s.total_ms,
      row_number() over (order by s.total_ms, s.achieved_at) as place,
      count(*) over () as players
    from public.scores s join public.profiles p on p.user_id = s.user_id
    where s.board_id = board
  ), me as (
    select r.place from ranked r where r.user_id = auth.uid()
  )
  select r.place::integer, r.name, r.total_ms, coalesce(r.user_id = auth.uid(), false), r.players::integer
  from ranked r
  where r.place <= least(greatest(coalesce(how_many, 10), 1), 50)
     or abs(r.place - coalesce((select me.place from me), -1000)) <= least(greatest(coalesce(around, 2), 0), 5)
  order by r.place;
$$;

-- The overall list: the missions' points from the cloud save, the same lines as board_view (a tie: who joined first)
create function public.points_view(how_many integer default 10, around integer default 2)
  returns table (place integer, name text, points integer, is_me boolean, players integer)
  language sql stable security definer set search_path = '' as $$
  with scored as (
    select s.user_id, p.name, p.created_at, public.save_points(s.progress) as points
    from public.saves s join public.profiles p on p.user_id = s.user_id
  ), ranked as (
    select r.user_id, r.name, r.points,
      row_number() over (order by r.points desc, r.created_at, r.user_id) as place,
      count(*) over () as players
    from scored r
    where r.points > 0
  ), me as (
    select r.place from ranked r where r.user_id = auth.uid()
  )
  select r.place::integer, r.name, r.points, coalesce(r.user_id = auth.uid(), false), r.players::integer
  from ranked r
  where r.place <= least(greatest(coalesce(how_many, 10), 1), 50)
     or abs(r.place - coalesce((select me.place from me), -1000)) <= least(greatest(coalesce(around, 2), 0), 5)
  order by r.place;
$$;

revoke all on function public.save_points(jsonb) from public, anon, authenticated;
revoke all on function public.saves_profile() from public, anon, authenticated;
revoke all on function public.board_view(text, integer, integer) from public;
revoke all on function public.points_view(integer, integer) from public;
grant execute on function public.board_view(text, integer, integer) to anon, authenticated;
grant execute on function public.points_view(integer, integer) to anon, authenticated;
