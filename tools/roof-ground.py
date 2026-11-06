# tools/roof-ground.py — for tools/build-roof-atlases.mjs (PIL): how much of each building's patch of orthophoto looks
# like ground (meadow, garden, trees) rather than a roof. Reads a JSON job list on stdin,
# [{ "src": jpeg path, "ring": [x0, y0, x1, y1, ...] (source px, the roof outline) }], and writes a JSON list of
# [vegetation share, pixels counted], one per job. A pixel counts as vegetation when it is clearly greener than red and
# blue; very dark pixels (deep shadow: a roof's own or a tree's) are left out of the count.
import json
import sys
from PIL import Image, ImageDraw

sources = {}


def source(path):
    if path not in sources:
        if len(sources) > 8:
            sources.clear()
        sources[path] = Image.open(path).convert('RGB')
    return sources[path]


out = []
for job in json.load(sys.stdin):
    image = source(job['src'])
    ring = job['ring']
    xs, ys = ring[0::2], ring[1::2]
    left, top = max(0, int(min(xs))), max(0, int(min(ys)))
    right, bottom = min(image.width, int(max(xs)) + 1), min(image.height, int(max(ys)) + 1)
    if right - left < 2 or bottom - top < 2:
        out.append([0, 0])
        continue
    crop = image.crop((left, top, right, bottom))
    mask = Image.new('L', crop.size, 0)
    ImageDraw.Draw(mask).polygon([(x - left, y - top) for x, y in zip(xs, ys)], fill=255)
    green = counted = 0
    for (r, g, b), m in zip(crop.getdata(), mask.getdata()):
        if not m or r + g + b < 90:
            continue
        counted += 1
        if g > r * 1.08 and g > b * 1.12 and g - min(r, b) > 14:
            green += 1
    out.append([green / counted if counted else 0, counted])
json.dump(out, sys.stdout)
