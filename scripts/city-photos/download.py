"""Step 2: download each chosen photo, write web-sized copies + a manifest."""
import io, json, os, re, sys, time, unicodedata, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]  # .../public/photos/cities
UA = "CanvaTwoCityPhotos/1.0 (https://github.com/mir-ashiq/canvix)"
ABBR = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"}
FREE = re.compile(r"^(CC0|CC BY|CC-BY|Public domain|PD|GFDL|FAL|Attribution|No restrictions)", re.I)

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def fetch(url):
    for _ in range(10):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as r:
                data = r.read()
            time.sleep(1.0)
            return data
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                wait = min(60, int(e.headers.get("Retry-After") or 20) + 3)
                print("  wait", e.code, wait, flush=True)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("gave up " + url)

def main():
    cs = json.load(open(os.path.join(HERE, "meta.json")))
    os.makedirs(os.path.join(OUT, "thumbs"), exist_ok=True)
    manifest, missing = [], []
    for i, c in enumerate(cs):
        img = c.get("image")
        why = None
        if not img or not img.get("thumb"):
            why = c.get("error") or "no photo on Wikipedia/Wikidata"
        elif img.get("mime") == "image/svg+xml":
            why = "only a drawing/map on file, no photo"
        elif img.get("nonFree") or not FREE.search(img.get("license") or ""):
            why = f"licence not clearly free ({img.get('license') or 'unknown'})"
        if why:
            missing.append({"city": c["city"], "state": c["state"], "population": c["population"], "reason": why})
            continue
        sid = f"{slug(c['city'])}-{ABBR[c['state']].lower()}"
        full = os.path.join(OUT, sid + ".jpg")
        try:
            if not os.path.exists(full):
                im = Image.open(io.BytesIO(fetch(img["thumb"])))
                im = im.convert("RGB")
                im.thumbnail((1280, 1280))
                im.save(full, "JPEG", quality=76, optimize=True, progressive=True)
                t = im.copy(); t.thumbnail((400, 400))
                t.save(os.path.join(OUT, "thumbs", sid + ".jpg"), "JPEG", quality=70, optimize=True)
            w, h = Image.open(full).size
        except Exception as e:
            missing.append({"city": c["city"], "state": c["state"], "population": c["population"], "reason": f"download failed ({e})"})
            continue
        author = re.sub(r"\s+", " ", img.get("author") or "Unknown").strip()[:120]
        manifest.append({
            "id": sid, "city": c["city"], "state": c["state"], "st": ABBR[c["state"]],
            "population": c["population"], "width": w, "height": h,
            "credit": {"provider": "Wikimedia Commons", "author": author,
                       "license": img.get("license") or "", "url": img.get("page") or ""},
        })
        print(i, sid, flush=True)
    manifest.sort(key=lambda m: -m["population"])
    json.dump(manifest, open(os.path.join(OUT, "index.json"), "w"), separators=(",", ":"))
    json.dump(missing, open(os.path.join(HERE, "missing.json"), "w"), indent=1)
    print("done", len(manifest), "photos,", len(missing), "missing")

if __name__ == "__main__":
    main()
