-- The Silberberg's ore shift rebuilt (no hunt to push any more: ore bins along the rails, a fifth more for walking out
-- before the lamp dies): a new balance, so a new list (js/missions-data-mine.js board: 'silberberg-mine-2'), the old one
-- closed as 20261105120000_leaderboards.sql says (its runs kept, no longer ranked). The cap: 4 × gold at most, 2 × gold
-- at least (tests/leaderboard.test.mjs).

insert into public.boards (id, mission, kind, min_ms, max_ms, max_score) values
  ('silberberg-mine-2', 'silberberg-mine', 'score', 15000, 3600000, 3500)
  on conflict (id) do update set kind = excluded.kind, min_ms = excluded.min_ms, max_ms = excluded.max_ms, max_score = excluded.max_score, ranked = true;

update public.boards set ranked = false where id = 'silberberg-mine-1';
