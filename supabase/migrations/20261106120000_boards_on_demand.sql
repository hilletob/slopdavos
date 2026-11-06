-- A new mission needs no migration: its list is made the first time a signed-in player starts it (js/leaderboard.js,
-- startRun with the mission's way of judging). Such a list gets the generous limits below instead of limits fitted to its
-- medals; a row inserted by hand (or a later migration: update public.boards set ... where id = ...) tightens them.
-- What the browser decides is only whether the list is by time or by score, and only for a list nobody has started yet.
-- Runs after 20261106090000_all_leaderboards.sql.

alter table public.boards add column auto boolean not null default false;

drop function public.start_run(text);

-- kind: 'time' or 'score', used only when the list does not exist yet (null: an unknown list is not made)
create function public.start_run(board text, kind text default null) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  uid constant uuid := auth.uid();
  auto_limit constant integer := 200; -- (lists made this way, at most: a guard against filling the table with junk ids)
  run uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.boards b where b.id = board) then
    -- (coalesce: a missing kind or board makes the test null, which must count as a no)
    if not coalesce(kind in ('time', 'score') and length(board) <= 64 and board ~ '^[a-z0-9]+(-[a-z0-9]+)*-[0-9]{1,3}$', false)
      or (select count(*) from public.boards b where b.auto) >= auto_limit then
      return null;
    end if;
    insert into public.boards (id, mission, kind, min_ms, max_ms, max_score, auto)
      values (board, regexp_replace(board, '-[0-9]+$', ''), kind,
              case kind when 'score' then 10000 else 5000 end, 3600000,
              case kind when 'score' then 100000 end, true)
      on conflict (id) do nothing;
  end if;
  if not exists (select 1 from public.boards b where b.id = board and b.ranked) then return null; end if;
  insert into public.run_starts (user_id, board_id) values (uid, board)
    on conflict (user_id, board_id) do update set id = gen_random_uuid(), started_at = now()
    returning id into run;
  return run;
end $$;

revoke all on function public.start_run(text, text) from public, anon;
grant execute on function public.start_run(text, text) to authenticated;
