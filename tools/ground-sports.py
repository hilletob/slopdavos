# tools/ground-sports.py — the eyes of tools/trace-ground.mjs (layer `sports`): reads the SWISSIMAGE crops of the sports
# grounds (0.1 m) and classifies their pixels; draws the review images of the vectors fitted to them. PIL + numpy only.
#
#   classify <jobs.json>   per job { id, img, res, cls, buildings: [[[px, py], ...]], ... } writes job.cls: one byte per
#                          pixel (row-major, w × h of the image), the bits below; and <cls>.png, the classes in colour
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


COLOURS = {'w': (255, 255, 255), 'y': (255, 215, 0), 'b': (40, 90, 255), 'r': (230, 30, 30)}
KIND_OUTLINE = {'tartan-red': (255, 0, 255), 'tartan-blue': (0, 255, 255), 'tartan-green': (120, 255, 120), 'turf': (0, 255, 120),
                'clay': (255, 140, 0), 'sand': (255, 230, 120), 'asphalt': (160, 160, 160), 'grass': (60, 160, 60)}


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
    # the lines thin and in cyan (template) or orange (traced), so that the paint beneath stays visible
    for ln in site.get('lines', []):
        pts = S(ln['pts'])
        if len(pts) >= 2:
            d.line(pts, fill=(255, 140, 0) if ln.get('traced') else (0, 230, 255), width=1)
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
    elif mode == 'review':
        for site in data:
            review(site)
            print('[ground-sports] review', site['out'], flush=True)


if __name__ == '__main__':
    main()
