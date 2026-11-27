# python3 -I contact-sheet.py <buildings/slug> → <buildings/slug>/sheet.jpg: the photos 4 × 3 on one image, each labelled
# with its number, the side of the building it was taken from and its year (from photos.txt), to look through at once
import sys, os, re
from PIL import Image, ImageDraw
d = sys.argv[1]
meta = {}
for line in open(os.path.join(d, 'photos.txt'), encoding='utf8'):
    m = re.match(r'(\S+\.jpg): taken from the (\S+),.*?(\d{4})-\d\d-\d\d', line)
    if m: meta[m.group(1)] = (m.group(2), m.group(3))
fs = sorted(f for f in os.listdir(os.path.join(d, 'photos')) if f.endswith('.jpg'))[:12]
W, H = 400, 300
sheet = Image.new('RGB', (W * 4, H * 3), 'black')
draw = ImageDraw.Draw(sheet)
for i, f in enumerate(fs):
    try: im = Image.open(os.path.join(d, 'photos', f)).convert('RGB')
    except Exception: continue
    im.thumbnail((W, H)); x, y = (i % 4) * W, (i // 4) * H
    sheet.paste(im, (x, y))
    side, year = meta.get(f, ('?', '?'))
    label = f'{i + 1} from {side} {year}'
    draw.rectangle([x, y, x + 8 + 7 * len(label), y + 16], fill='black')
    draw.text((x + 4, y + 3), label, fill='yellow')
sheet.save(os.path.join(d, 'sheet.jpg'), quality=80)
print(os.path.join(d, 'sheet.jpg'), len(fs), 'photos')
