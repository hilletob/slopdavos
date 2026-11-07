# tools/ground-sports.py — the eyes of tools/trace-ground.mjs (layer `sports`): reads the SWISSIMAGE crops of the sports
# grounds (0.1 m) and classifies their pixels; draws the review images of the vectors fitted to them. PIL + numpy only.
#
#   classify <jobs.json>   per job { id, img, res, cls, buildings: [[[px, py], ...]], ... } writes job.cls: one byte per
#                          pixel (row-major, w × h of the image), the bits below; and <cls>.png, the classes in colour
#   classify-roads <jobs.json>   the paint on the ground (tools/markings-layer.mjs): per job also { roads: [{ pts, w }]
#                          (centrelines and widths in pixels), exclude: [[[px, py], ...]] (left out) }; bits ROAD (1: on a
#                          carriageway or another paved surface), WHITE, YELLOW, BUILDING
#   classify-ground <jobs.json>   per job { img (a hires orthophoto tile), out (.png), kinds: { name: value },
#                          buildings: [[[px, py], ...]], scale } writes the tile's ground classes (tools/classes-layer.mjs):
#                          one byte a pixel at `scale` of the image's resolution, the value of its ground kind
#                          (js/ground-kinds.js index + 1; 0: none)
#   occupancy <jobs.json>   per job { img, res, bays: [[[px, py] × 4]] } whether a car stands in each bay: its middle
#                          uneven (a car's glass, paint and shadow) or unlike the row's empty asphalt; writes <jobs>-occ.json
#   review <review.json>   per site { img, out, surfaces: [{ kind, ring, holes }], lines: [{ c, w, pts }], osm, labels }
#                          (pixel coordinates) draws the vectors over the photo into `out`
#
# The classes (bits):
RED = 1      # red / orange tartan (and clay: told apart by tools/trace-ground.mjs from the tags)
BLUE = 2     # blue tartan
GREEN = 4    # green ground: grass or turf
REDDISH = 8  # faded red: old tartan, weathered courts (hue as RED, s > 0.15); counts only on pitches tagged synthetic
WHITE = 16   # white paint: bright, unsaturated, brighter than the ground 0.7 m around, thin
YELLOW = 32  # yellow paint
BUILDING = 64  # under a building of the map (red roofs are not tartan)
CLAY = 128   # red ground of a duller, browner orange: clay, cinder, sand (red & hue 12–35° & s < 0.55)
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


def box_mean(a, r):
    """Mean over a (2r+1)² box (integral image)."""
    p = np.pad(a, r + 1, mode='edge').cumsum(0).cumsum(1)
    k = 2 * r + 1
    s = p[k:, k:] - p[:-k, k:] - p[k:, :-k] + p[:-k, :-k]
    return s[: a.shape[0], : a.shape[1]] / (k * k)


def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(2)
    mn = rgb.min(2)
    c = v - mn
    s = c / np.maximum(v, 1e-3)
    cc = np.maximum(c, 1e-6)
    h = np.where(v == r, ((g - b) / cc) % 6, np.where(v == g, (b - r) / cc + 2, (r - g) / cc + 4)) * 60
    h = np.where(c < 1e-6, 0, h)
    return h, s, v


def classify(job):
    res = job['res']
    img = Image.open(job['img']).convert('RGB')
    W, H = img.size
    rgb = np.asarray(img, dtype=np.float32) / 255
    h, s, v = hsv(rgb)
    out = np.zeros((H, W), dtype=np.uint8)
    red = ((h < 30) | (h > 340)) & (s > 0.33) & (v > 0.3)
    blue = (h > 190) & (h < 245) & (s > 0.3) & (v > 0.25)
    green = (h > 65) & (h < 165) & (s > 0.22) & (v > 0.12)
    reddish = ((h < 30) | (h > 340)) & (s > 0.15) & (v > 0.2)
    local = box_mean(v, max(3, int(0.7 / res)))
    # (on clay the lines are a pale beige: less saturated than the ground around, if not grey)
    local_s = box_mean(s, max(3, int(0.7 / res)))
    white = ((v > 0.5) & (s < 0.32) & (v - local > 0.07)) | ((v > 0.45) & (s < local_s - 0.06) & (v - local > 0.035))
    white &= box_mean(white.astype(np.float32), max(2, int(0.35 / res))) < 0.6
    yellow = (h > 38) & (h < 72) & (s > 0.4) & (v > 0.45) & (v - local > 0.03)
    clay = red & (h > 12) & (h < 35) & (s < 0.55)
    for m, bit in ((red, RED), (blue, BLUE), (green, GREEN), (reddish, REDDISH), (white, WHITE), (yellow, YELLOW), (clay, CLAY)):
        out[m] |= bit
    if job.get('buildings'):
        bm = Image.new('L', (W, H), 0)
        d = ImageDraw.Draw(bm)
        for poly in job['buildings']:
            if len(poly) >= 3:
                d.polygon([tuple(p) for p in poly], fill=255)
        bm = bm.filter(ImageFilter.MaxFilter(int(1.0 / res) | 1))
        out[np.asarray(bm) > 0] |= BUILDING
    out.tofile(job['cls'])
    # a picture of the classes, for tuning
    pic = np.zeros((H, W, 3), dtype=np.uint8)
    pic[out & GREEN > 0] = (40, 90, 30)
    pic[(out & REDDISH > 0) & (out & RED == 0)] = (110, 60, 50)
    pic[out & RED > 0] = (200, 60, 40)
    pic[out & BLUE > 0] = (40, 80, 220)
    pic[out & CLAY > 0] = (170, 110, 60)
    pic[out & BUILDING > 0] = (pic[out & BUILDING > 0] * 0.4 + np.array([60, 60, 90]) * 0.6).astype(np.uint8)
    pic[out & YELLOW > 0] = (250, 220, 0)
    pic[out & WHITE > 0] = (255, 255, 255)
    Image.fromarray(pic).save(job['cls'] + '.png')
    return {'w': W, 'h': H}


def classify_roads(job):
    res = job['res']
    img = Image.open(job['img']).convert('RGB')
    W, H = img.size
    rgb = np.asarray(img, dtype=np.float32) / 255
    h, s, v = hsv(rgb)
    road = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(road)
    for r in job['roads']:
        pts = [tuple(p) for p in r['pts']]
        if len(pts) >= 2:
            d.line(pts, fill=255, width=max(1, int(round(r['w']))), joint='curve')
            rad = r['w'] / 2
            for x, y in (pts[0], pts[-1]):
                d.ellipse((x - rad, y - rad, x + rad, y + rad), fill=255)
    # and every paved surface off the streets (yards, forecourts, private car parks: grey, unsaturated over ~1.5 m, neither
    # glaring nor black), the buildings left out
    kp = max(3, int(1.5 / res))
    paved = (box_mean(s, kp) < 0.2) & (box_mean(v, kp) > 0.2) & (box_mean(v, kp) < 0.8)
    road = np.asarray(road) > 0
    road |= paved
    bm = Image.new('L', (W, H), 0)
    db = ImageDraw.Draw(bm)
    for poly in job.get('exclude', []) + job.get('buildings', []):
        if len(poly) >= 3:
            db.polygon([tuple(p) for p in poly], fill=255)
    # (widened by ~1.2 m: the map's outlines sit a little off the photo's roofs, whose bright edges are no paint)
    road &= ~(np.asarray(bm.filter(ImageFilter.MaxFilter(int(2.4 / res) | 1))) > 0)
    k = max(3, int(0.7 / res))
    local = box_mean(v, k)
    local_s = box_mean(s, k)
    # (paint is a ridge, brighter than the ground on both sides: the top-hat, v less its opening over ~0.7 m, keeps it
    # and drops the bright side of a shadow's edge, which a comparison with the mean round it took for a line)
    v8 = Image.fromarray((v * 255).astype(np.uint8))
    win = int(0.7 / res) | 1
    opened = np.asarray(v8.filter(ImageFilter.MinFilter(win)).filter(ImageFilter.MaxFilter(win)), dtype=np.float32) / 255
    ridge = v - opened
    white = ((v > 0.5) & (s < 0.32) & (ridge > 0.07)) | ((v > 0.45) & (s < local_s - 0.06) & (ridge > 0.035))
    # (thin: a bright patch filling most of the ~0.7 m round it is a car's roof, not paint)
    white &= box_mean(white.astype(np.float32), max(2, int(0.35 / res))) < 0.6
    yellow = (h > 36) & (h < 70) & (s > 0.38) & (v > 0.42) & (ridge > 0.02)
    # (faded yellow is nearly white: paint of a yellow hue counts as yellow, however pale)
    pale = (v > 0.45) & (h > 35) & (h < 72) & (s > 0.11) & (ridge > 0.035)
    yellow |= pale
    white &= ~yellow
    out = np.zeros((H, W), dtype=np.uint8)
    out[road] |= RED  # (bit 1: on the road)
    # the paved ground off the mapped streets and car parks (yards, forecourts, drives): bit 2 dark (asphalt), 8 light
    # (concrete, slabs); `streets`: the mapped carriageways and car parks only
    if job.get('pavedOff'):
        st = Image.new('L', (W, H), 0)
        ds = ImageDraw.Draw(st)
        # (the carriageways with their sidewalks, ~3 m each side, and the footways: drawn as their own slabs)
        for r in job['roads'] + job.get('walks', []):
            pts = [tuple(p) for p in r['pts']]
            if len(pts) >= 2:
                ds.line(pts, fill=255, width=max(1, int(round(r['w'] + (6.0 if r in job['roads'] else 0.5) / res))), joint='curve')
        for poly in job.get('lots', []):
            if len(poly) >= 3:
                ds.polygon([tuple(p) for p in poly], fill=255)
        off = paved & ~(np.asarray(st) > 0) & ~(np.asarray(bm.filter(ImageFilter.MaxFilter(int(1.0 / res) | 1))) > 0)
        lv = box_mean(v, kp)
        out[off & (lv < 0.5)] |= BLUE
        out[off & (lv >= 0.5)] |= GREEN
    out[white & road] |= WHITE
    out[yellow & road] |= YELLOW
    out.tofile(job['cls'])
    # how yellow each pixel of paint is (min(r, g) − b, ×4), for the colour of each blob (tools/markings-fit.mjs)
    yel = np.clip((np.minimum(rgb[..., 0], rgb[..., 1]) - rgb[..., 2]) * 4 * 255, 0, 255).astype(np.uint8)
    yel[~((white | yellow) & road)] = 0
    yel.tofile(job['cls'] + '.yel')
    pic = (np.asarray(img) * 0.45).astype(np.uint8)
    pic[road] = (pic[road] * 0.6 + np.array([40, 40, 60]) * 0.4).astype(np.uint8)
    pic[white & road] = (255, 255, 255)
    pic[yellow & road] = (255, 210, 0)
    Image.fromarray(pic).save(job['cls'] + '.png')
    return {'w': W, 'h': H}


def classify_ground(job):
    img = Image.open(job['img']).convert('RGB')
    W, H = img.size
    rgb = np.asarray(img, dtype=np.float32) / 255
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h, s, v = hsv(rgb)
    K = job['kinds']
    k = max(2, int(round(0.9 / job['res'])))
    sd = np.sqrt(np.maximum(box_mean(v * v, k) - box_mean(v, k) ** 2, 0))
    # green: by hue, or (in shade, where the photo is dark) by the green standing above red and blue
    green = ((h > 55) & (h < 170) & (s > 0.15) & (g > r * 1.02)) | ((v < 0.25) & (g > r * 1.04) & (g > b * 1.02))
    rough = sd > job.get('treeStd', 0.06)
    out = np.full((H, W), K['paving'], np.uint8)
    # (dark and not green: shade, whose ground is told by what lies round it, below; 0 until then)
    dark = (v < 0.3) & ~green
    out[dark] = 0
    out[green & ~rough & (v > 0.12)] = K['lawn']
    out[green & (rough | (v <= 0.12))] = K['shrub']
    out[(~green) & (h > 18) & (h < 50) & (s > 0.12) & (s < 0.45) & (v > 0.3)] = K['gravel']
    out[(~green) & ((h <= 18) | (h > 340)) & (s > 0.18) & (v > 0.3)] = K['red-paving']
    # under the buildings (drawn as solids): what lies round them, so that no roof's colour bleeds out at their feet
    if job.get('buildings'):
        bm = Image.new('L', (W, H), 0)
        d = ImageDraw.Draw(bm)
        for poly in job['buildings']:
            if len(poly) >= 3:
                d.polygon([tuple(p) for p in poly], fill=255)
        inside = np.asarray(bm) > 0
        out[inside] = K['paving']
    sc = job.get('scale', 0.5)
    if sc != 1:
        out = np.asarray(Image.fromarray(out).resize((max(1, int(W * sc)), max(1, int(H * sc))), Image.NEAREST)).copy()
    # the shade: the kind most of the ground ~5 m round it has (the forest floor under its trees, the lawn in a house's
    # shadow), asphalt where nothing round it is known (a dark yard)
    unknown = out == 0
    if unknown.any():
        rad = max(2, int(round(5 / (job['res'] / sc))))
        best, arg = np.zeros(out.shape, np.float32), np.full(out.shape, K['asphalt'], np.uint8)
        for val in sorted(set(K.values()) - {K['asphalt']}):
            share = box_mean((out == val).astype(np.float32), rad)
            better = share > best
            best[better] = share[better]
            arg[better] = val
        out[unknown] = np.where(best[unknown] > 0.05, arg[unknown], K['asphalt'])
    out = np.asarray(Image.fromarray(out).filter(ImageFilter.ModeFilter(3)))
    Image.fromarray(out, 'L').save(job['out'], optimize=True)
    # the mean colour of each kind in the photo (linear), lit parts only: for js/ground-kinds.js
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    full = np.asarray(Image.fromarray(out).resize((W, H), Image.NEAREST))
    means = {}
    for name, val in K.items():
        m = (full == val) & (v > 0.3)
        if m.sum() > 1000:
            means[name] = [round(float(x), 3) for x in lin[m].mean(0)]
    return {'means': means, 'w': out.shape[1], 'h': out.shape[0]}


def occupancy(job):
    img = Image.open(job['img']).convert('RGB')
    rgb = np.asarray(img, dtype=np.float32) / 255
    h, s, v = hsv(rgb)
    stats = []
    for quad in job['bays']:
        m = Image.new('L', img.size, 0)
        # the middle of the bay: its corners pulled a third of the way in
        cx = sum(p[0] for p in quad) / 4
        cy = sum(p[1] for p in quad) / 4
        ImageDraw.Draw(m).polygon([(cx + (p[0] - cx) * 0.65, cy + (p[1] - cy) * 0.65) for p in quad], fill=255)
        sel = np.asarray(m) > 0
        if sel.sum() < 20:
            stats.append(None)
            continue
        stats.append((float(np.median(v[sel])), float(v[sel].std()), float(np.percentile(s[sel], 75))))
    # the empty asphalt: the evenest bays' brightness
    even = sorted((st for st in stats if st), key=lambda st: st[1])
    ref = np.median([st[0] for st in even[: max(1, len(even) // 3)]]) if even else 0.4
    out = []
    for st in stats:
        if not st:
            out.append(0)
            continue
        med, sd, sat = st
        out.append(1 if sd > 0.085 or abs(med - ref) > 0.12 or sat > 0.3 else 0)
    return out


COLOURS = {'w': (255, 255, 255), 'y': (255, 215, 0), 'b': (40, 90, 255), 'r': (230, 30, 30)}
KIND_OUTLINE = {'yard': (255, 140, 0), 'asphalt': (255, 140, 0), 'paving': (190, 190, 255), 'tartan-red': (255, 0, 255), 'tartan-blue': (0, 255, 255), 'tartan-green': (120, 255, 120), 'turf': (0, 255, 120),
                'clay': (255, 140, 0), 'sand': (255, 230, 120), 'grass': (60, 160, 60)}


def review(site):
    img = Image.open(site['img']).convert('RGB')
    scale = site.get('scale', 1)
    if scale != 1:
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    tint = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(tint)
    S = lambda pts: [(x * scale, y * scale) for x, y in pts]
    for s in site.get('surfaces', []):
        col = KIND_OUTLINE.get(s['kind'], (255, 255, 0))
        d.polygon(S(s['ring']), fill=col + (40,))
        for hole in s.get('holes', []):
            d.polygon(S(hole), fill=(0, 0, 0, 0))
    img = Image.alpha_composite(img.convert('RGBA'), tint).convert('RGB')
    d = ImageDraw.Draw(img)
    for poly in site.get('osm', []):
        d.line(S(poly + poly[:1]), fill=(60, 120, 255), width=1)
    for s in site.get('surfaces', []):
        col = KIND_OUTLINE.get(s['kind'], (255, 255, 0))
        for ring in [s['ring']] + s.get('holes', []):
            d.line(S(ring + ring[:1]), fill=col, width=2)
    for f in site.get('fills', []):
        d.polygon(S(f['ring']), outline=(255, 225, 0) if f.get('c') == 'y' else (255, 0, 255))
    for b in site.get('bays', []):
        d.polygon(S(b['quad']), outline=(255, 60, 60) if b['occupied'] else (60, 255, 60))
    # the lines thin and in cyan (template) or orange (traced), so that the paint beneath stays visible
    for ln in site.get('lines', []):
        pts = S(ln['pts'])
        if len(pts) >= 2:
            d.line(pts, fill=(255, 140, 0) if ln.get('traced') else (255, 225, 0) if ln.get('c') == 'y' and site.get('colours') else (0, 230, 255), width=1)
    try:
        font = ImageFont.load_default(size=max(12, int(18 * scale)))
    except TypeError:
        font = ImageFont.load_default()
    for lb in site.get('labels', []):
        x, y = lb['at'][0] * scale, lb['at'][1] * scale
        d.text((x + 1, y + 1), lb['text'], fill=(0, 0, 0), font=font)
        d.text((x, y), lb['text'], fill=(255, 255, 0), font=font)
    img.save(site['out'])


def main():
    mode, path = sys.argv[1], sys.argv[2]
    data = json.load(open(path))
    if mode == 'classify':
        info = {}
        for job in data:
            info[job['id']] = classify(job)
            print('[ground-sports] classified', job['id'], info[job['id']], flush=True)
        json.dump(info, open(path.replace('.json', '-info.json'), 'w'))
    elif mode == 'classify-roads':
        for job in data:
            classify_roads(job)
            print('[ground-sports] roads classified', job['id'], flush=True)
    elif mode == 'classify-ground':
        info = {}
        for job in data:
            info[job['id']] = classify_ground(job)
            print('[ground-sports] ground classes', job['id'], info[job['id']]['means'], flush=True)
        json.dump(info, open(path.replace('.json', '-info.json'), 'w'))
    elif mode == 'occupancy':
        json.dump({job['id']: occupancy(job) for job in data}, open(path.replace('.json', '-occ.json'), 'w'))
    elif mode == 'review':
        for site in data:
            review(site)
            print('[ground-sports] review', site['out'], flush=True)


if __name__ == '__main__':
    main()
