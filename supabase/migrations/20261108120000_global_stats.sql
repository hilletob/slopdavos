-- The game's numbers for everyone (welcome/index.html): all players with an account together, nothing about anyone in
-- particular. Play time and the ways of travel from the cloud saves' device lines (20261106150000_play_stats.sql), the
-- missions done and their medals from the saves' progress, the runs on the leaderboards from public.scores.

create function public.global_stats() returns jsonb
  language sql stable security definer set search_path = '' as $$
  with devices as (
    select d.value as line
    from public.saves s
    cross join lateral jsonb_each(case when jsonb_typeof(s.stats) = 'object' then s.stats else '{}'::jsonb end) d
  ),
  travel as (
    select m.key as kind, sum(public.stats_count(m.value->'ms')) as ms, sum(public.stats_count(m.value->'m')) as metres
    from devices
    cross join lateral jsonb_each(case when jsonb_typeof(line->'modes') = 'object' then line->'modes' else '{}'::jsonb end) m
    where m.key ~ '^[a-z-]{1,24}$'
    group by m.key
  ),
  entries as (
    select e.value as entry
    from public.saves s
    cross join lateral jsonb_each(case when jsonb_typeof(s.progress->'missions') = 'object' then s.progress->'missions' else '{}'::jsonb end) e
    where jsonb_typeof(e.value) = 'object'
  )
  select jsonb_build_object(
    'players', (select count(*) from public.saves),
    'playHours', round(coalesce((select sum(public.stats_count(line->'playMs')) from devices), 0) / 3600000.0, 1),
    'sessions', coalesce((select sum(public.stats_count(line->'sessions')) from devices), 0),
    'missionsDone', (select count(*) from entries),
    'gold', (select count(*) from entries where entry->>'medal' = 'gold'),
    'silver', (select count(*) from entries where entry->>'medal' = 'silver'),
    'bronze', (select count(*) from entries where entry->>'medal' = 'bronze'),
    'rankedRuns', (select count(*) from public.scores),
    'km', round(coalesce((select sum(metres) from travel), 0) / 1000.0, 1),
    'travel', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'hours', round(ms / 3600000.0, 2), 'km', round(metres / 1000.0, 1)) order by metres desc)
      from (select * from travel where metres > 0 order by metres desc limit 12) t
    ), '[]'::jsonb),
    'at', now()
  )
$$;

revoke all on function public.global_stats() from public;
grant execute on function public.global_stats() to anon, authenticated;
