import { getClient } from './account.js';

// js/race-net.js
// The wire of a race (js/race-session.js): one Supabase Realtime channel a room, `race:<CODE>`, with Presence for who is in
// the room (each player tracks { id, name, joinedAt, mission }) and Broadcast for everything else (js/race-protocol.js
// EVENTS). Nothing is stored on the server: a room exists while someone is in it. The SDK is the account's (js/account.js
// getClient, loaded on demand); a guest's start stays as it was, the SDK comes when the lobby opens. Works signed in or
// not: the publishable key is enough for a public channel.

export const EVENTS = ['ping', 'pong', 'start', 'snap', 'finish', 'abort'];
const JOIN_TIMEOUT = 10000; // ms

/**
 * Joins the room `code` as `me` ({ id, name, mission }). Resolves once subscribed and tracked, with
 * { members(), send(event, payload), track(patch), leave() }. onPresence(members) on every change in the room,
 * onEvent(event, payload) for each broadcast of the others, onStatus(status) with the channel's states ('SUBSCRIBED',
 * 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'). Rejects when the channel cannot be joined.
 */
export async function joinRace(code, me, { onPresence = () => {}, onEvent = () => {}, onStatus = () => {} } = {}) {
  const supabase = await getClient();
  const channel = supabase.channel(`race:${code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: me.id } } });
  for (const event of EVENTS) channel.on('broadcast', { event }, ({ payload }) => { try { onEvent(event, payload); } catch (error) { console.warn('[race] on', event, error); } });
  const members = () => Object.values(channel.presenceState()).flat().map(({ presence_ref, ...state }) => state).filter((m) => m && m.id);
  channel.on('presence', { event: 'sync' }, () => onPresence(members()));
  let state = { ...me, joinedAt: Date.now() };
  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('TIMED_OUT')); } }, JOIN_TIMEOUT);
    channel.subscribe(async (status, error) => {
      onStatus(status, error);
      if (status === 'SUBSCRIBED') {
        try { await channel.track(state); } catch (e) { console.warn('[race] track', e); } // (after a reconnect too: the state comes back)
        if (!settled) { settled = true; clearTimeout(timer); resolve(); }
      } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
        settled = true; clearTimeout(timer); reject(error || new Error(status));
      }
    });
  });
  return {
    members,
    /** Fire and forget: a lost snapshot is replaced by the next one */
    send(event, payload) { return channel.send({ type: 'broadcast', event, payload }).catch(() => 'error'); },
    /** The own presence state changed (the name): the others see it with the next sync */
    track(patch) { state = { ...state, ...patch }; return channel.track(state).catch(() => {}); },
    leave() { return supabase.removeChannel(channel).catch(() => {}); }
  };
}
