"""Step 3: US place coordinates (Census Gazetteer) for "nearest city photo".

Writes OUT/places.json  {ST: {normalized name: [lat, lon]}}  and adds
lat/lon to every entry of OUT/index.json.
"""
import csv, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
SUFFIX = re.compile(r"\s+(city and borough|consolidated government \(balance\)|metropolitan government \(balance\)|metro government \(balance\)|unified government \(balance\)|urban county|city \(balance\)|municipality|city|town|village|borough|township|CDP|comunidad|zona urbana)$", re.I)

def norm(s):
    s = s.lower().replace("st.", "saint").replace("ft.", "fort").replace("mt.", "mount")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

gaz = os.path.join(HERE, "2024_Gaz_place_national.txt")
places = {}
if not os.path.exists(gaz):
    # no Gazetteer file here: reuse the places.json already in the app
    print("Gazetteer not found - reusing existing places.json")
    places = json.load(open(os.path.join(OUT, "places.json")))
else:
    with open(os.path.join(HERE, "2024_Gaz_place_national.txt"), encoding="latin-1") as f:
        for r in csv.reader(f, delimiter="\t"):
            if r[0] == "USPS":
                continue
            st, name = r[0].strip(), SUFFIX.sub("", r[3].strip())
            lat, lon = round(float(r[10]), 3), round(float(r[11].strip()), 3)
            keys = {norm(name)}
            if name.endswith(" City") and name not in ("Carson City", "Jefferson City", "Oklahoma City", "Salt Lake City", "Kansas City", "New York City", "Atlantic City", "Panama City", "Rapid City", "Sioux City", "Bay City", "Iowa City", "Lake Havasu City"):
                keys.add(norm(name[:-5]))  # "Boise City" → "boise"
            for part in re.split(r"[-/]", name):
                keys.add(norm(part))
            for k in keys:
                if k:
                    places.setdefault(st, {}).setdefault(k, [lat, lon])

json.dump(places, open(os.path.join(OUT, "places.json"), "w"), separators=(",", ":"))
idx_path = os.path.join(OUT, "index.json")
idx = json.load(open(idx_path))
miss = 0
for e in idx:
    k = norm(e["city"].replace(" City", "") if e["city"] == "New York City" else e["city"])
    ll = places.get(e["st"], {}).get(k)
    if ll:
        e["lat"], e["lon"] = ll
    else:
        miss += 1
        print("no coords:", e["city"], e["st"])
json.dump(idx, open(idx_path, "w"), separators=(",", ":"))
print("places:", sum(len(v) for v in places.values()), "coords missing:", miss)
