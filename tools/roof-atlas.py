# tools/roof-atlas.py — composes the roof atlases for tools/build-roof-atlases.mjs (PIL): reads a JSON job list on stdin,
# [{ "out": webp path, "w", "h", "quality", "items": [{ "src": jpeg path, "box": [left, top, right, bottom] (source px,
# the rect plus one pixel of margin), "at": [px - 1, py - 1], "size": [pw + 2, ph + 2] }] }], and writes each atlas as
# WebP. The margin pixel round each crop keeps the texture filter from bleeding the neighbours in.
import json
import sys
from PIL import Image

sources = {}


def source(path):
    if path not in sources:
        if len(sources) > 8:
            sources.clear()
        sources[path] = Image.open(path).convert('RGB')
    return sources[path]


for job in json.load(sys.stdin):
    atlas = Image.new('RGB', (job['w'], job['h']), (90, 90, 90))
    for item in job['items']:
        crop = source(item['src']).crop(tuple(item['box']))
        if crop.size != tuple(item['size']):
            crop = crop.resize(tuple(item['size']), Image.LANCZOS)
        atlas.paste(crop, tuple(item['at']))
    atlas.save(job['out'], 'WEBP', quality=job.get('quality', 70), method=6)
