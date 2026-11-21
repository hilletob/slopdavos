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

# Multiplayer: Gigi's table (guessing questions)

The second kind of room: the mission `gigi-schaetzt` (`js/missions-data-quiz.js`, `quiz: true`) played by up to ten players
at one table. It reuses the race's room: the code, the host election, the clock offset, the guest's identity
(`js/race-protocol.js`), the wire (`js/race-net.js` `joinRoom(topic, events, …)`) and the lobby (`js/race-ui.js`
`openRoomLobby(kind, …)`, with the table's words from `js/quiz-ui.js`).

- **Entry:** "Play together" in the mission's briefing opens a table with a code; the link is `?quiz=<CODE>`; the lobby also has a field for another table's code (or its pasted link), which leaves the own table and joins that one
  (`manager.openQuiz`, `js/missions.js`). Loaded on demand; a lone player's round needs no network at all.
- **Channel** `quiz:<CODE>`, presence `{ id, name, joinedAt, mission, phase: 'lobby' | 'playing' }`, broadcasts
  `ping`, `pong`, `start`, `guess` (`js/quiz-session.js`).
  - `start { from, at, seed, qids, ids }`: only the host's is taken. `qids` are the three questions, `seed` decides the
    regulars' guesses and Gigi's lines, `ids` who has a seat (the first ten by `joinedAt`), `at` the round's start on the
    host's clock. From there the round runs by the clock on every client (`phaseAt`): a lead, then for each question the
    asking, 20 s of guessing and the reveal. If the host leaves, the round goes on; the next host starts the next one.
  - `guess { id, r, g: [v0, v1, v2] }`: a player's guesses of the round `r` so far, sent when one is locked in, again
    1.5 s later and once more when the guessing time ends (broadcasts are not acknowledged). The others show a tick at
    that seat at once ("3 of 7 have guessed"); the number shows at the reveal.
  - `cut { from, r, q, at }`: once every player still in the room has guessed question `q`, the host ends its
    guessing time at `at` (its clock, 1.5 s ahead) instead of letting the countdown run out; every client cuts the
    same out of its schedule (`endGuessing`). Sent twice.
- **Every client scores for itself** (`questionResult`, `tableStandings`): points by how close the guess is, the same
  whatever the size of the table, so the mission's leaderboard stays comparable. No anti-cheat, as in the race.
- **The regulars** (`QUIZ_BOTS`) fill the table up to four seats; their guesses come from the seed, so they are the same
  on every client. Alone all four sit down, and the waiting is cut once the player has guessed (`cutWaiting`).
- **Languages:** only ids, the seed and numbers go over the wire. Each client shows the questions, Gigi's lines and the
  numbers (12’500 / 12,500) in its own language; a German and an English player sit at the same table.
- **Late comers** (a round is on, or the table is full) stay in the lobby and are in for the next round.
- **Messages:** a handful per player and question; nothing like the race's 8 Hz stream.
- **Test:** `tests/quiz.test.mjs` (the game's logic, two sessions on a wire of their own, every text's German).
