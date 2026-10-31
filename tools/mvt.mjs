// tools/mvt.mjs — a minimal Mapbox Vector Tile (protobuf) decoder for the data tools: layers with their features'
// properties and geometry in tile pixel coordinates (0..extent), points as [[x, y]], lines/polygons as rings.
import zlib from 'node:zlib';

function reader(buf) {
  let pos = 0;
  const varint = () => { let r = 0, s = 0, b; do { b = buf[pos++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
  return {
    get pos() { return pos; }, set pos(v) { pos = v; }, end: buf.length, varint,
    key() { const k = varint(); return [k >>> 3, k & 7]; },
    bytes() { const n = varint(); const out = buf.subarray(pos, pos + n); pos += n; return out; },
    skip(type) { if (type === 0) varint(); else if (type === 1) pos += 8; else if (type === 2) pos += varint(); else if (type === 5) pos += 4; else throw new Error('wire type ' + type); },
    float() { const v = buf.readFloatLE(pos); pos += 4; return v; }, double() { const v = buf.readDoubleLE(pos); pos += 8; return v; }
  };
}
const zigzag = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);

function value(bytes) {
  const r = reader(bytes);
  while (r.pos < r.end) {
    const [f, t] = r.key();
    if (f === 1) return Buffer.from(r.bytes()).toString('utf8');
    if (f === 2) return r.float();
    if (f === 3) return r.double();
    if (f === 4 || f === 5) return r.varint();
    if (f === 6) return zigzag(r.varint());
    if (f === 7) return !!r.varint();
    r.skip(t);
  }
  return null;
}

function geometry(cmds) {
  const rings = []; let ring = null, x = 0, y = 0;
  for (let i = 0; i < cmds.length;) {
    const c = cmds[i++], id = c & 7, n = c >> 3;
    if (id === 7) { if (ring?.length) ring.push([...ring[0]]); continue; }
    for (let k = 0; k < n; k++) {
      x += zigzag(cmds[i++]); y += zigzag(cmds[i++]);
      if (id === 1) { ring = [[x, y]]; rings.push(ring); } else ring.push([x, y]);
    }
  }
  return rings;
}

export function decodeTile(raw) {
  const buf = raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw;
  const r = reader(buf), layers = {};
  while (r.pos < r.end) {
    const [f, t] = r.key();
    if (f !== 3) { r.skip(t); continue; }
    const lr = reader(r.bytes()), keys = [], values = [], feats = [];
    let name = '', extent = 4096;
    while (lr.pos < lr.end) {
      const [lf, lt] = lr.key();
      if (lf === 1) name = Buffer.from(lr.bytes()).toString('utf8');
      else if (lf === 2) feats.push(lr.bytes());
      else if (lf === 3) keys.push(Buffer.from(lr.bytes()).toString('utf8'));
      else if (lf === 4) values.push(value(lr.bytes()));
      else if (lf === 5) extent = lr.varint();
      else lr.skip(lt);
    }
    layers[name] = { extent, features: feats.map((fb) => {
      const fr = reader(fb), props = {}; let type = 0, cmds = [];
      while (fr.pos < fr.end) {
        const [ff, ft] = fr.key();
        if (ff === 2 || ff === 4) {
          const pr = reader(fr.bytes()), arr = [];
          while (pr.pos < pr.end) arr.push(pr.varint());
          if (ff === 2) for (let i = 0; i < arr.length; i += 2) props[keys[arr[i]]] = values[arr[i + 1]];
          else cmds = arr;
        } else if (ff === 3) type = fr.varint();
        else fr.skip(ft);
      }
      return { type, props, rings: geometry(cmds) };
    }) };
  }
  return layers;
}
