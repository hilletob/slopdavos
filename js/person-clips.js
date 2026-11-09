// js/person-clips.js
// Motion-captured clips for the people (assets/models/person-clips.bin, tools/build-person-clips.mjs: Microsoft
// Rocketbox animations, MIT, retargeted to the 15 bones of js/pedestrians.js), played by PersonRig.setClips while a
// person stands: idling, talking & listening in a conversation, writing a ticket.

let library = null;

/**
 * The clips, once (a promise): { byName: Map, idle(female), talk(female), listen(female) } — the sets are the same
 * arrays every call (PersonRig.setClips compares them)
 */
export function loadPersonClips() {
  library ??= fetch(new URL('../assets/models/person-clips.bin', import.meta.url).href)
    .then((r) => {
      if (!r.ok) throw new Error(`[person-clips] ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      const len = new DataView(buf).getUint32(0, true);
      const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len)));
      const start = Math.ceil((4 + len) / 4) * 4;
      const stride = header.bones * 4 + 3;
      const byName = new Map();
      for (const c of header.clips) {
        byName.set(c.name, {
          name: c.name,
          fps: header.fps,
          frames: c.frames,
          duration: (c.frames - 1) / header.fps,
          data: new Int16Array(buf, start + c.offset * 2, c.frames * stride)
        });
      }
      const set = (...names) => names.map((n) => byName.get(n)).filter(Boolean);
      const sets = {
        idle: [set('m_idle_neutral_03', 'm_idle_look_around_03', 'm_idle_scratch_head_02', 'm_idle_breathe_03'),
          set('f_idle_neutral_02', 'f_idle_look_around_01', 'f_idle_touch_hair_01', 'f_idle_breathe_02')],
        talk: [set('m_gestic_talk_neutral_03'), set('f_gestic_talk_neutral_02')],
        listen: [set('m_gestic_listen_neutral_02'), set('f_gestic_listen_neutral_03')]
      };
      return {
        byName,
        idle: (female) => sets.idle[female ? 1 : 0],
        talk: (female) => sets.talk[female ? 1 : 0],
        listen: (female) => sets.listen[female ? 1 : 0]
      };
    });
  return library;
}
