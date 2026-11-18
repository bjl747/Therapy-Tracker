"""Step 4: find each photo's point of interest so crops keep the skyline in frame.

Edge-energy centroid on a small greyscale copy (buildings/detail = edges,
sky/water = flat). Writes "focus": {"x", "y"} (0..1) into index.json.
"""
import json, math, os, sys
from PIL import Image, ImageFilter

OUT = sys.argv[1]
path = os.path.join(OUT, "index.json")
idx = json.load(open(path))
for e in idx:
    f = os.path.join(OUT, e["id"] + ".jpg")
    if not os.path.exists(f):
        continue
    im = Image.open(f).convert("L")
    im.thumbnail((96, 96))
    ed = im.filter(ImageFilter.FIND_EDGES)
    w, h = ed.size
    px = ed.load()
    tot = sx = sy = 0.0
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            # prior: skylines sit in the upper-middle; foreground clutter is low
            v = (px[x, y] ** 1.5) * math.exp(-((y / h - 0.42) ** 2) / (2 * 0.25 ** 2))
            tot += v; sx += v * x; sy += v * y
    if tot <= 0:
        continue
    fx, fy = sx / tot / w, sy / tot / h
    # stay close to centre: the centroid is a nudge, not a jump
    fx = 0.5 + max(-0.22, min(0.22, (fx - 0.5) * 1.2))
    fy = 0.5 + max(-0.18, min(0.18, (fy - 0.5) * 1.2))
    e["focus"] = {"x": round(fx, 3), "y": round(fy, 3)}
json.dump(idx, open(path, "w"), separators=(",", ":"))
print("focus set:", sum(1 for e in idx if "focus" in e), "/", len(idx))
