# tools/parking-bays.py — finds the painted parking bays of the car parks in SWISSIMAGE crops, for
# tools/detect-parking-bays.mjs (PIL + numpy only).
#
# Per lot: the white paint is picked out inside the lot (bright, unsaturated, brighter than the asphalt around it);
# a Hough transform of the paint pixels gives the line directions — the bay separators (many short parallel lines,
# repeating every 2.2–3.4 m) and the row lines (few long ones); then, row by row, the separators beside each row line
# give the bays: between two neighbouring separators, as deep as the separators reach. A bay counts as occupied when
# its middle differs from the lot's asphalt (a car's paint, glass and shadow).
#
# usage: python3 -I tools/parking-bays.py <jobs.json> <out.json> [debug-lot-id debug.png]
#   jobs.json: [{ id, img, res, poly: [[px, py], ...] }]  (pixel coordinates of the crop)
#   out.json:  { id: { bays: [[cx, cy, hx, hy, w, l, occupied], ...] (pixels, heading (hx, hy), metres), score } }
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def box_mean(a, r):
    """Mean over a (2r+1)² box (integral image)."""
    p = np.pad(a, r + 1, mode='edge').cumsum(0).cumsum(1)
    k = 2 * r + 1
    s = p[k:, k:] - p[:-k, k:] - p[k:, :-k] + p[:-k, :-k]
    return s[: a.shape[0], : a.shape[1]] / (k * k)


def peaks(h, min_height, min_dist):
    """Local maxima of a 1-D histogram, strongest first, at least min_dist apart."""
    idx = [i for i in range(1, len(h) - 1) if h[i] >= min_height and h[i] >= h[i - 1] and h[i] >= h[i + 1]]
    idx.sort(key=lambda i: -h[i])
    out = []
    for i in idx:
        if all(abs(i - j) >= min_dist for j in out):
            out.append(i)
    return sorted(out)


def smooth(h, r=1):
    k = np.ones(2 * r + 1) / (2 * r + 1)
    return np.convolve(h, k, mode='same')


def detect(job, debug=None):
    res = job['res']
    img = Image.open(job['img']).convert('RGB')
    W, H = img.size
    rgb = np.asarray(img, dtype=np.float32) / 255
    v = rgb.max(2)
    s = (v - rgb.min(2)) / np.maximum(v, 1e-3)
    # The lot, widened by ~1.5 m (lines on its edge)
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in job['poly']], fill=255)
    grow = int(1.5 / res) | 1
    lot = np.asarray(m.filter(ImageFilter.MaxFilter(min(grow, 31))), dtype=bool)
    inner = np.asarray(m, dtype=bool)
    if inner.sum() < 400:
        return None
    # Paint: bright, unsaturated, brighter than the ground ~0.7 m around
    local = box_mean(v, max(3, int(0.7 / res)))
    paint = lot & (v > 0.5) & (s < 0.25) & (v - local > 0.09)
    # Paint lines are thin: a bright patch filling most of the ~0.7 m around it is a car roof or a kerb, not paint
    paint &= box_mean(paint.astype(np.float32), max(3, int(0.35 / res))) < 0.6
    near_paint = np.asarray(Image.fromarray((paint * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), dtype=bool)
    ys, xs = np.nonzero(paint)
    n = len(xs)
    if n < int(25 / res):  # under ~25 m of paint line
        return {'bays': [], 'score': 0, 'why': 'little paint'}
    # Hough: for each normal angle the projections' histogram; parallel lines make it peaky
    thetas = np.deg2rad(np.arange(0, 180, 0.5))
    diag = int(math.hypot(W, H)) + 2
    best = []
    for t in thetas:
        rho = (xs * math.cos(t) + ys * math.sin(t)).astype(np.int32) + diag
        h = np.bincount(rho, minlength=2 * diag + 1).astype(np.float32)
        hs = smooth(h, 1)
        peakiness = float((hs * hs).sum()) / n
        # periodicity at the bay spacing (2.2–3.4 m)
        lo, hi = int(2.2 / res), int(3.4 / res) + 1
        c = hs - hs.mean()
        den = float((c * c).sum()) or 1.0
        per = max(float((c[:-k] * c[k:]).sum()) / den for k in range(lo, hi))
        best.append((t, peakiness, per, h))
    # Separators: the most periodic direction; rows: the peakiest direction at least 25° from it
    sep = max(best, key=lambda b: b[2] * b[1])
    if sep[2] < 0.12:
        return {'bays': [], 'score': round(sep[2], 3), 'why': 'no regular separators'}
    ts = sep[0]
    others = [b for b in best if min(abs(b[0] - ts), math.pi - abs(b[0] - ts)) > math.radians(25)]
    row = max(others, key=lambda b: b[1])
    tb = row[0]
    cs, ss_, cb, sb = math.cos(ts), math.sin(ts), math.cos(tb), math.sin(tb)
    rs = xs * cs + ys * ss_          # across the separators
    rb = xs * cb + ys * sb           # across the row lines
    # Row lines: long lines along the rows (≥ 4 m of paint in one 0.3 m wide band)
    hb = smooth(np.bincount((rb + diag).astype(np.int32), minlength=2 * diag + 1).astype(np.float32), 1)
    row_lines = [p - diag for p in peaks(hb, max(4.0 / res, 0.3 * hb.max()), int(1.5 / res))]
    # Separator direction (along the bays) and the depth axis
    hx, hy = -ss_, cs
    along_n = abs(hx * cb + hy * sb) or 1.0   # |heading · row normal|
    bays = []
    lo_gap, hi_gap = 2.1 / res, 3.5 / res
    for b0 in row_lines:
        for side in (1, -1):
            d = side * (rb - b0)
            sel = (d > 0.4 / res) & (d < 6.2 / res)
            if sel.sum() < 30:
                continue
            hsep = smooth(np.bincount((rs[sel] + diag).astype(np.int32), minlength=2 * diag + 1).astype(np.float32), 1)
            pk = peaks(hsep, max(1.2 / res, 0.25 * hsep.max()), int(1.6 / res))
            if len(pk) < 2:
                continue
            # how deep the separators of this row reach from the row line
            depths = []
            for p in pk:
                near = sel & (np.abs(rs + diag - p) <= 2)
                if near.sum() > 5:
                    depths.append(np.percentile(d[near], 92))
            if not depths:
                continue
            depth = float(np.clip(np.median(depths), 3.8 / res, 6.0 / res))
            if depth < 3.0 / res:
                continue
            for a, c in zip(pk, pk[1:]):
                gap = c - a
                if not lo_gap <= gap <= hi_gap:
                    continue
                cs_mid = (a + c) / 2 - diag
                cb_mid = b0 + side * depth / 2
                det = cs * sb - ss_ * cb
                if abs(det) < 1e-6:
                    continue
                x = (cs_mid * sb - ss_ * cb_mid) / det
                y = (cs * cb_mid - cs_mid * cb) / det
                xi, yi = int(round(x)), int(round(y))
                if not (0 <= xi < W and 0 <= yi < H) or not lot[yi, xi]:
                    continue
                w = gap * res
                l = min(6.5, depth / along_n * res)
                # heading away from the row line (the bay's back line lies on it)
                fx, fy = (hx, hy) if (hx * cb + hy * sb) * side > 0 else (-hx, -hy)
                bays.append([float(x), float(y), fx, fy, round(w, 2), round(l, 2), 0, (b0, side)])
    # Every bay must show its side lines in the photo (paint along at least one side, some along both)
    def side_paint(bay, sgn):
        x, y, bx, by, w, l = bay[:6]
        px, py = -by, bx
        hits = tot = 0
        for t in np.linspace(-0.35, 0.35, 15) * (l / res):
            qx, qy = x + px * sgn * w / res / 2 + bx * t, y + py * sgn * w / res / 2 + by * t
            qi, qj = int(round(qy)), int(round(qx))
            if 0 <= qi < H and 0 <= qj < W:
                tot += 1
                hits += near_paint[qi, qj]
        return hits / tot if tot else 0
    raw = len(bays)
    checked = []
    for bay in bays:
        a, b = side_paint(bay, 1), side_paint(bay, -1)
        if max(a, b) >= 0.4 and a + b >= 0.6:
            checked.append(bay + [a + b])
    # A row of fewer than three bays is more likely bright cars or kerbs than paint
    rows = {}
    for bay in checked:
        rows[bay[7]] = rows.get(bay[7], 0) + 1
    checked = [b for b in checked if rows[b[7]] >= 3]
    # Overlapping bays: keep the better painted one
    checked.sort(key=lambda b: -b[8])
    bays = []
    for b in checked:
        if all(math.hypot(b[0] - k[0], b[1] - k[1]) > 0.8 * min(b[4], k[4]) / res for k in bays):
            bays.append(b[:7])
    # Where most of what was found doesn't hold up, the lot isn't read reliably: keep the procedural layout
    if raw and len(bays) < 0.55 * raw:
        return {'bays': [], 'score': round(sep[2], 3), 'why': f'unreliable ({len(bays)} of {raw} bays confirmed)'}
    # Bays found twice (a row closed by lines at both ends): keep one
    kept = []
    for bay in bays:
        if all(math.hypot(bay[0] - k[0], bay[1] - k[1]) > 1.2 / res for k in kept):
            kept.append(bay)
    # Occupancy: the middle half of the bay against the lot's asphalt
    asphalt = inner & ~paint & (s < 0.2) & (v > 0.15) & (v < 0.75)
    if asphalt.sum() > 50:
        ref = np.median(rgb[asphalt], axis=0)
        for bay in kept:
            x, y, bx, by, w, l = bay[:6]
            px, py = -by, bx
            us = np.linspace(-0.25, 0.25, 7) * (w / res)
            vs = np.linspace(-0.3, 0.3, 9) * (l / res)
            pts = [(x + px * u + bx * t, y + py * u + by * t) for u in us for t in vs]
            diff = []
            for qx, qy in pts:
                qi, qj = int(qy), int(qx)
                if 0 <= qi < H and 0 <= qj < W:
                    diff.append(float(np.abs(rgb[qi, qj] - ref).max()))
            if diff and np.mean(np.array(diff) > 0.12) > 0.4:
                bay[6] = 1
    if debug:
        dbg = img.copy()
        dr = ImageDraw.Draw(dbg)
        pm = Image.fromarray((paint * 255).astype(np.uint8))
        dbg.paste((255, 0, 255), mask=pm)
        for bay in kept:
            x, y, bx, by, w, l, occ = bay
            px, py = -by, bx
            hw, hl = w / res / 2, l / res / 2
            corners = [(x + px * su * hw + bx * sv * hl, y + py * su * hw + by * sv * hl) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            dr.polygon(corners, outline=(255, 40, 40) if occ else (0, 220, 255), width=3)
        dr.polygon([tuple(p) for p in job['poly']], outline=(255, 255, 0), width=2)
        dbg.save(debug)
    return {'bays': [[round(b[0], 1), round(b[1], 1), round(b[2], 4), round(b[3], 4), b[4], b[5], b[6]] for b in kept],
            'score': round(sep[2], 3), 'rows': len(row_lines), 'confirmed': round(len(bays) / raw, 2) if raw else 0}


def main():
    jobs = json.load(open(sys.argv[1]))
    debug_id = sys.argv[3] if len(sys.argv) > 4 else None
    out = {}
    for job in jobs:
        try:
            out[job['id']] = detect(job, sys.argv[4] if job['id'] == debug_id else None)
        except Exception as e:  # one bad crop must not stop the others
            out[job['id']] = {'bays': [], 'score': 0, 'why': f'error: {e}'}
    json.dump(out, open(sys.argv[2], 'w'))


if __name__ == '__main__':
    main()
