-- How long each player plays and how they get about (js/play-stats.js): one line per device, a device only ever adds to its
-- own, so merging keeps per device the line with more play time. Written only through merge_stats(); read by the player
-- through it, and by the project's owner through the views at the end (the dashboard's SQL editor or table view).

alter table public.saves add column stats jsonb not null default '{}';

-- A count: a number, rounded, 0 up to 10^15 (a time in ms since 1970 too) (anything else: 0)
create function public.stats_count(v jsonb) returns bigint
  language sql immutable security definer set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' then least(greatest(round((v #>> '{}')::numeric), 0), 1e15)::bigint else 0 end
$$;

-- One device's line, tidied: only known shapes and sane numbers (anything else counts as nothing)
create function public.stats_line(line jsonb) returns jsonb
  language sql immutable security definer set search_path = '' as $$
  select jsonb_build_object(
    'at', public.stats_count(line->'at'),
    'playMs', public.stats_count(line->'playMs'),
    'sessions', public.stats_count(line->'sessions'),
    'modes', coalesce((
      select jsonb_object_agg(m.key, jsonb_build_object('ms', public.stats_count(m.value->'ms'), 'm', public.stats_count(m.value->'m')))
      from (select * from jsonb_each(case when jsonb_typeof(line->'modes') = 'object' then line->'modes' else '{}' end) limit 40) m
      where m.key ~ '^[a-z-]{1,24}$' and jsonb_typeof(m.value) = 'object'
    ), '{}'))
$$;

-- Two sets of device lines together: per device the line with more play time, the 16 devices played on last
create function public.stats_merge(a jsonb, b jsonb) returns jsonb
  language sql immutable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(id, line), '{}') from (
    select id, line from (
      select distinct on (id) id, line from (
        select d.key id, public.stats_line(d.value) line
        from jsonb_each(case when jsonb_typeof(a) = 'object' then a else '{}' end) d
        union all
        select d.key, public.stats_line(d.value)
        from (select * from jsonb_each(case when jsonb_typeof(b) = 'object' then b else '{}' end) limit 64) d
      ) both_sides
      where id ~ '^[a-z0-9]{8,32}$'
      order by id, (line->>'playMs')::bigint desc, (line->>'at')::bigint desc
    ) best
    order by (line->>'at')::bigint desc
    limit 16
  ) kept
$$;

-- The player's device lines into the cloud save; answers all of them (the other devices' too)
create function public.merge_stats(devices jsonb) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
  merged jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.saves s set stats = public.stats_merge(s.stats, devices) where s.user_id = uid returning s.stats into merged;
  return coalesce(merged, public.stats_merge('{}', devices));
end $$;

revoke all on function public.stats_line(jsonb) from public, anon, authenticated;
revoke all on function public.stats_count(jsonb) from public, anon, authenticated;
revoke all on function public.stats_merge(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.merge_stats(jsonb) from public, anon;
grant execute on function public.merge_stats(jsonb) to authenticated;

-- For the owner: one line per player (the newest first), and per player and way of travel. Not for the browser.
create view public.player_stats with (security_invoker = true) as
  select s.user_id, u.email, p.name,
         round(sum((d.value->>'playMs')::bigint) / 3600000.0, 2) as hours,
         sum((d.value->>'sessions')::bigint) as sessions,
         count(d.key) as devices,
         to_timestamp(max((d.value->>'at')::bigint) / 1000.0) as last_played
  from public.saves s
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.user_id = s.user_id
  cross join lateral jsonb_each(s.stats) d
  group by s.user_id, u.email, p.name
  order by last_played desc;

create view public.player_travel with (security_invoker = true) as
  select s.user_id, u.email, p.name, m.key as travel,
         round(sum((m.value->>'ms')::bigint) / 60000.0, 1) as minutes,
         round(sum((m.value->>'m')::bigint) / 1000.0, 2) as km
  from public.saves s
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.user_id = s.user_id
  cross join lateral jsonb_each(s.stats) d
  cross join lateral jsonb_each(d.value->'modes') m
  group by s.user_id, u.email, p.name, m.key
  order by u.email, minutes desc;

-- All players together, per way of travel
create view public.travel_totals with (security_invoker = true) as
  select travel, count(distinct user_id) as players, round(sum(minutes) / 60, 2) as hours, round(sum(km), 1) as km
  from public.player_travel group by travel order by hours desc;

revoke all on public.player_stats, public.player_travel, public.travel_totals from public, anon, authenticated;
