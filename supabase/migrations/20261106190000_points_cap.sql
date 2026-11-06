-- The overall list's cap (public.save_points, 20261105180000_leaderboard_overview.sql) with room to grow: 46500 was what
-- 62 missions are worth, and the Seehofseeli's fresh ice is the 63rd. 75000 is a hundred missions; a cap above the missions'
-- worth costs nothing (tests/leaderboard.test.mjs checks the latest definition against js/missions-progress.js maxPoints).
create or replace function public.save_points(progress jsonb) returns integer
  language sql immutable security definer set search_path = '' as $$
  select least(75000, coalesce(sum(250 + case e.value->>'medal' when 'gold' then 500 when 'silver' then 250 when 'bronze' then 100 else 0 end), 0))::integer
  from jsonb_each(case when jsonb_typeof(progress->'missions') = 'object' then progress->'missions' else '{}'::jsonb end) e
  where jsonb_typeof(e.value) = 'object';
$$;

revoke all on function public.save_points(jsonb) from public, anon, authenticated;
