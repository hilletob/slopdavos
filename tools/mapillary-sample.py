# tools/mapillary-sample.py — measures the facade boxes listed by tools/fetch-mapillary.mjs in the Mapillary thumbnails.
# usage: python3 -I tools/mapillary-sample.py <jobs.json> <thumb cache dir> <out.json>
# Per image: a mild exposure and grey-world white-balance normalisation (square-rooted, so a snowy or dusky picture is
# only partly corrected). Per box: sky (blue, bright), vegetation (green) and window/shadow darks are left out; the rest
# gives the median colour (linear RGB) and the share of timber (dark, saturated brown). A building's boxes are combined
# by their weights; the confidence grows with the summed weight and the usable share, and drops when the views
# disagree.
import json, math, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

jobs_path, thumbs, out_path = sys.argv[1:4]
os.makedirs(thumbs, exist_ok=True)
jobs = json.load(open(jobs_path))

def fetch(job):
    path = os.path.join(thumbs, f"{job['id']}.jpg")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    for attempt in range(3):
        try:
            with urllib.request.urlopen(job['url'], timeout=60) as r:
                data = r.read()
            with open(path, 'wb') as f:
                f.write(data)
            return path
        except Exception:
            pass
    return None

urls = {}
for j in jobs:
    urls.setdefault(j['id'], j)
with ThreadPoolExecutor(8) as pool:
    paths = dict(zip(urls.keys(), pool.map(fetch, urls.values())))
print(f"[mapillary] {sum(1 for p in paths.values() if p)}/{len(paths)} thumbnails")

LIN = [((i / 255) / 12.92) if i / 255 <= 0.04045 else (((i / 255) + 0.055) / 1.055) ** 2.4 for i in range(256)]
images = {}

def load(id_):
    if id_ in images:
        return images[id_]
    p = paths.get(id_)
    if not p:
        images[id_] = None
        return None
    try:
        im = Image.open(p).convert('RGB')
    except Exception:
        images[id_] = None
        return None
    small = im.resize((32, max(1, round(32 * im.height / im.width))))
    px = [(LIN[r], LIN[g], LIN[b]) for r, g, b in small.getdata()]
    m = [sum(c[k] for c in px) / len(px) for k in range(3)]
    lum = sorted(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px)[len(px) // 2]
    expo = min(1.8, max(0.6, math.sqrt(0.16 / max(lum, 1e-3))))
    grey = sum(m) / 3
    wb = [min(1.3, max(0.77, math.sqrt(grey / max(c, 1e-4)))) for c in m]
    images[id_] = (im, [expo * w for w in wb])
    return images[id_]

def measure(job):
    got = load(job['id'])
    if not got:
        return None
    im, gain = got
    W, H = im.size
    u0, v0, u1, v1 = job['box']
    box = (int(u0 * W), int(v0 * H), max(int(u0 * W) + 2, int(u1 * W)), max(int(v0 * H) + 2, int(v1 * H)))
    crop = im.crop(box)
    if crop.width * crop.height > 4000:
        s = math.sqrt(4000 / (crop.width * crop.height))
        crop = crop.resize((max(2, int(crop.width * s)), max(2, int(crop.height * s))))
    keep, wood = [], 0
    total = crop.width * crop.height
    for r8, g8, b8 in crop.getdata():
        r, g, b = LIN[r8] * gain[0], LIN[g8] * gain[1], LIN[b8] * gain[2]
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if lum < 0.012:
            continue  # windows, deep shadow
        if b > r * 1.15 and b > g * 1.03 and lum > 0.2:
            continue  # sky
        if g > r * 1.12 and g > b * 1.12:
            continue  # trees, lawns
        keep.append((r, g, b))
        mx, mn = max(r8, g8, b8), min(r8, g8, b8)
        if mx < 120 and mx - mn > 0.25 * mx and r8 >= g8 >= b8:
            wood += 1  # dark brown: timber boarding or logs
    if len(keep) < 0.15 * total or len(keep) < 20:
        return None
    med = [sorted(c[k] for c in keep)[len(keep) // 2] for k in range(3)]
    return med, wood / len(keep), len(keep) / total

by_key = {}
for job in jobs:
    m = measure(job)
    if m:
        by_key.setdefault(job['key'], []).append((m, job['w']))

out = {}
for key, views in by_key.items():
    ws = sum(w * share for (_, _, share), w in views)
    if ws <= 0:
        continue
    col = [sum(c[k] * w * share for (c, _, share), w in views) / ws for k in range(3)]
    wood = sum(wd * w * share for (_, wd, share), w in views) / ws
    # agreement between the views (relative spread of their luminance)
    lums = [0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] for (c, _, _), _ in views]
    mean = sum(lums) / len(lums)
    spread = (max(lums) - min(lums)) / max(mean, 1e-3) if len(lums) > 1 else 0.6
    conf = (1 - math.exp(-1.6 * ws)) * max(0.25, 1 - 0.6 * spread)
    out[key] = [round(min(1, c) * 255) for c in col] + [round(wood * 100), round(conf * 100)]
# Calibration: the views' facade medians come out dark (shade, glazing, the street images' exposure). The median of
# the plastered facades (little timber) is set to a light plaster (0.42 linear luminance), all colours scaled alike;
# after that, a building still darkish (< 0.3) and brown (red > green > blue, clearly warm), or with a quarter of its
# pixels timber-brown, is a timber house.
lum = lambda v: (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255
plaster = sorted(lum(v) for v in out.values() if v[3] < 20)
scale = 0.42 / max(plaster[len(plaster) // 2], 1e-3) if plaster else 1
for key, v in out.items():
    r, g, b = (min(255, round(c * scale)) for c in v[:3])
    timber = (lum((r, g, b)) < 0.3 and r > g > b and (r - b) > 0.3 * max(r, 1)) or v[3] >= 25
    out[key] = [r, g, b, max(v[3], 70) if timber else v[3], v[4]]
print(f"[mapillary] exposure calibration x{scale:.2f}, {sum(1 for v in out.values() if v[3] >= 45)} timber facades")
json.dump(out, open(out_path, 'w'))
confs = sorted(v[4] for v in out.values())
if confs:
    print(f"[mapillary] {len(out)} buildings measured; confidence p25/p50/p75 {confs[len(confs)//4]}/{confs[len(confs)//2]}/{confs[3*len(confs)//4]}")
