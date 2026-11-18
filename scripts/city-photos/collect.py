"""Collect one free-licensed photo per US city (pop >= 50k) from Wikimedia.

Step 1 (this script): Census list -> Wikipedia article -> Wikidata P18 image
(fallback: article lead image) -> Commons licence metadata. Writes meta.json.
Polite pacing; honours Retry-After on 429.
"""
import csv, json, re, sys, time, urllib.parse, urllib.request, os

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "CanvaTwoCityPhotos/1.0 (https://github.com/mir-ashiq/canvix)"

def get(url, params):
    q = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(12):
        req = urllib.request.Request(q, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                time.sleep(1.5)
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                wait = int(e.headers.get("Retry-After") or 30) + 5
                print(f"  {e.code}, waiting {wait}s", flush=True)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("gave up: " + q)

SUFFIX = re.compile(r"\s+(city and borough|consolidated government \(balance\)|metropolitan government \(balance\)|metro government \(balance\)|unified government \(balance\)|urban county|city \(balance\)|municipality|city|town|village|borough|township|CDP)$")
OVERRIDES = {
    ("New York", "New York"): "New York City",
    ("Nashville-Davidson", "Tennessee"): "Nashville, Tennessee",
    ("Louisville/Jefferson County", "Kentucky"): "Louisville, Kentucky",
    ("Lexington-Fayette", "Kentucky"): "Lexington, Kentucky",
    ("Athens-Clarke County", "Georgia"): "Athens, Georgia",
    ("Augusta-Richmond County", "Georgia"): "Augusta, Georgia",
    ("Macon-Bibb County", "Georgia"): "Macon, Georgia",
    ("Columbus", "Georgia"): "Columbus, Georgia",
    ("Boise City", "Idaho"): "Boise, Idaho",
    ("San Buenaventura (Ventura)", "California"): "Ventura, California",
    ("Washington", "District of Columbia"): "Washington, D.C.",
    ("Anchorage", "Alaska"): "Anchorage, Alaska",
    ("Urban Honolulu", "Hawaii"): "Honolulu",
}

def cities():
    out = []
    for r in csv.DictReader(open(os.path.join(HERE, "sub.csv"), encoding="latin-1")):
        if r["SUMLEV"] != "162" or int(r["POPESTIMATE2024"]) < 50000:
            continue
        name = SUFFIX.sub("", r["NAME"]).strip()
        st = r["STNAME"]
        title = OVERRIDES.get((name, st), f"{name}, {st}")
        out.append({"city": re.sub(r",.*", "", title), "state": st, "population": int(r["POPESTIMATE2024"]), "title": title})
    return out

def chunks(xs, n=50):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]

def main():
    cs = cities()
    print(len(cs), "cities", flush=True)
    WP = "https://en.wikipedia.org/w/api.php"
    # 1. Wikipedia: resolve titles, get wikidata id + lead (free) image
    for batch in chunks(cs):
        d = get(WP, {"action": "query", "format": "json", "redirects": 1, "prop": "pageprops|pageimages",
                     "ppprop": "wikibase_item|disambiguation", "piprop": "name", "pilicense": "free",
                     "titles": "|".join(c["title"] for c in batch)})
        q = d["query"]
        alias = {}
        for k in ("normalized", "redirects"):
            for m in q.get(k, []):
                alias[m["from"]] = m["to"]
        pages = {p["title"]: p for p in q["pages"].values()}
        for c in batch:
            t = c["title"]
            while t in alias:
                t = alias[t]
            p = pages.get(t, {})
            if "missing" in p or "disambiguation" in p.get("pageprops", {}):
                c["error"] = "no article"
                continue
            c["article"] = t
            c["qid"] = p.get("pageprops", {}).get("wikibase_item")
            c["leadImage"] = p.get("pageimage")
        print("wiki batch ok", flush=True)
    # 2. Wikidata P18 (a single representative photo, usually better than a montage)
    WD = "https://www.wikidata.org/w/api.php"
    withq = [c for c in cs if c.get("qid")]
    for batch in chunks(withq):
        d = get(WD, {"action": "wbgetentities", "format": "json", "props": "claims",
                     "ids": "|".join(c["qid"] for c in batch)})
        for c in batch:
            cl = d["entities"].get(c["qid"], {}).get("claims", {})
            p18 = [x["mainsnak"].get("datavalue", {}).get("value") for x in cl.get("P18", [])]
            c["p18"] = [x for x in p18 if x]
        print("wikidata batch ok", flush=True)
    json.dump(cs, open(os.path.join(HERE, "stage1.json"), "w"), indent=1)
    # 3. Commons metadata + 1280px thumb URL for the chosen file
    for c in cs:
        cands = (c.get("p18") or []) + ([c["leadImage"]] if c.get("leadImage") else [])
        c["file"] = cands[0].replace("_", " ") if cands else None
    files = sorted({c["file"] for c in cs if c.get("file")})
    info = {}
    CM = "https://commons.wikimedia.org/w/api.php"
    for batch in chunks(files):
        d = get(CM, {"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime",
                     "iiurlwidth": 1280, "titles": "|".join("File:" + f for f in batch)})
        alias = {m["to"]: m["from"] for m in d["query"].get("normalized", [])}
        for p in d["query"]["pages"].values():
            if "imageinfo" not in p:
                continue
            ii = p["imageinfo"][0]
            em = ii.get("extmetadata", {})
            val = lambda k: re.sub(r"<[^>]+>", "", em.get(k, {}).get("value", "")).strip()
            info[p["title"][5:]] = {
                "thumb": ii.get("thumburl"), "width": ii.get("thumbwidth"), "height": ii.get("thumbheight"),
                "mime": ii.get("mime"), "page": ii.get("descriptionurl"),
                "author": val("Artist") or val("Credit"), "license": val("LicenseShortName"),
                "licenseUrl": val("LicenseUrl"), "attributionRequired": val("AttributionRequired"),
                "nonFree": val("NonFree"),
            }
        print("commons batch ok", flush=True)
    for c in cs:
        if c.get("file") and c["file"] in info:
            c["image"] = info[c["file"]]
    json.dump(cs, open(os.path.join(HERE, "meta.json"), "w"), indent=1)
    print("with image:", sum(1 for c in cs if c.get("image")), "/", len(cs))

if __name__ == "__main__":
    main()
