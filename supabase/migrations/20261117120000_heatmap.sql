-- The public heat map (heatmap.html, js/heatmap-page.js): where the players go. The world in cells of 16 m
-- (js/heat-trail.js: HEAT_CELL, the origin at the world's north-west corner, 1313 x 1013 cells), and per cell and group
-- of the way of travel (0 on foot, 1 wheels, 2 snow, 3 air, 4 rail) how often a player entered it. No player stands
-- beside a count: nothing here says who went where. Written only by signed-in players through heat_add(), read by
-- everybody through heat_view().

create table public.heat_cells (
  g  smallint not null check (g between 0 and 4),
  ix integer  not null check (ix between 0 and 1312),
  iz integer  not null check (iz between 0 and 1012),
  n  bigint   not null default 0,
  primary key (g, ix, iz)
);

-- How many cells a player has sent today: the limit of heat_add()
create table public.heat_quota (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  sent    integer not null default 0,
  primary key (user_id, day)
);

alter table public.heat_cells enable row level security;
alter table public.heat_quota enable row level security;
revoke all on table public.heat_cells, public.heat_quota from public, anon, authenticated;

-- A stretch of the player's trail: a flat list [g, ix, iz, n, …], at most 2000 cells a call and 60000 a day (960 km), a
-- count of at most 20 a cell. Answers the cells counted (0: over the day's limit). Anything out of shape is refused.
create function public.heat_add(cells jsonb) returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
  today constant date := (now() at time zone 'utc')::date;
  day_limit constant integer := 60000;
  n_cells integer;
  used integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(cells) <> 'array' or jsonb_array_length(cells) % 4 <> 0 or jsonb_array_length(cells) > 8000 then
    raise exception 'bad cells';
  end if;
  n_cells := jsonb_array_length(cells) / 4;
  if n_cells = 0 then return 0; end if;
  insert into public.heat_quota as q (user_id, day, sent) values (uid, today, n_cells)
    on conflict (user_id, day) do update set sent = q.sent + n_cells where q.sent + n_cells <= day_limit
    returning q.sent into used;
  if used is null then return 0; end if;
  -- (the days before: nothing reads them)
  delete from public.heat_quota q where q.user_id = uid and q.day < today;
  insert into public.heat_cells as c (g, ix, iz, n)
    select v.cg, v.cx, v.cz, sum(least(v.cn, 20))
    from (
      select (cells->>(i * 4))::integer as cg, (cells->>(i * 4 + 1))::integer as cx,
             (cells->>(i * 4 + 2))::integer as cz, (cells->>(i * 4 + 3))::integer as cn
      from generate_series(0, n_cells - 1) i
    ) v
    where v.cg between 0 and 4 and v.cx between 0 and 1312 and v.cz between 0 and 1012 and v.cn >= 1
    group by v.cg, v.cx, v.cz
    on conflict (g, ix, iz) do update set n = c.n + excluded.n;
  return n_cells;
end $$;

-- All counts: { cell, cells: [[g, ix, iz, n], …] }
create function public.heat_view() returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cell', 16,
    'cells', coalesce((select jsonb_agg(jsonb_build_array(c.g, c.ix, c.iz, c.n)) from public.heat_cells c), '[]'::jsonb))
$$;

revoke all on function public.heat_add(jsonb) from public, anon;
grant execute on function public.heat_add(jsonb) to authenticated;
revoke all on function public.heat_view() from public;
grant execute on function public.heat_view() to anon, authenticated;
