# Multiplayer: a race between players

First mission: the quad ride from Heldstab (`quad-heldstab`). Any time mission with `mode: 'car'` can follow by giving its
definition `race: { gates, nextGate(state, index) }`.

## How it works

- **No game server.** The room is a Supabase Realtime channel `race:<CODE>` (Broadcast + Presence over WebSocket), opened with
  the account's SDK (`js/account.js getClient`, loaded on demand). Nothing is stored; a room exists while someone is in it.
  Signed in or a guest, both can race; the publishable key is enough for a public channel.
- **Lobby** (`js/race-ui.js`): "Race together" in the mission's intro opens a room with a four-character code; the link
  `?race=<CODE>` joins it. The player's name: a signed-in player's leaderboard name, a guest types one (kept in
  `localStorage slopdavos-race-name`). The host is whoever has been in the room longest (the same answer on every client
  from the presence state); the host leaving makes the next one host.
- **Start** (`js/race-session.js`): the host's button names a moment on its clock, `COUNTDOWN_MS` ahead. Every client measured
  its offset to the host's clock with a few ping/pong round trips (median), starts the mission at once and holds the car at
  the start until the release; the run (`js/missions.js`) waits for `race.released()` instead of the first input. The time is
  the run's game time, as in single player, so the result compares with the leaderboard; each signed-in player's run is
  ranked as ever (`start_run`/`submit_run`).
- **Ghosts** (`js/race-ghosts.js`): each player sends their vehicle `SNAPSHOT_HZ` times a second (position, height over the
  ground, heading, tilt, speed, steering, the next gate: a short array). The receiver plays them back `PLAYBACK_DELAY_MS`
  behind, interpolated, and runs on for at most `MAX_EXTRAPOLATE_MS` when they stop. A ghost is drawn only: no collision.
- **Standings**: in the mission's panel (not on phones) and in the end dialog: finished by time, then racing by the gates
  passed and the way to the next, then those who dropped out. The host's "Race again" starts the next race for everyone.

## Limits

- Latency 50-150 ms over Realtime: fine for ghosts, not for contact. Collisions between players are left out on purpose.
- No anti-cheat for the race itself: the finish times are what each client says. The leaderboard keeps its own plausibility
  checks per player.
- Supabase's free plan: ~100 Realtime messages a second a project. Four riders at 8 Hz are a third of that; `SNAPSHOT_HZ`
  in `js/race-protocol.js` is the knob.
- Clock offsets: a device with a clock seconds off still starts together (the offset is measured), but the host election by
  `joinedAt` could disagree between clients with badly skewed clocks.
- The installed iPhone app in the background drops the WebSocket; the SDK reconnects, the presence comes back.
