"""Swap collage/montage city images for a single photo (article lead image or
another Wikidata image). Updates meta.json; re-run download.py afterwards."""
import json, re, sys, time, urllib.parse, urllib.request
UA = "CanvaTwoCityPhotos/1.0 (https://github.com/mir-ashiq/canvix)"
BAD = re.compile(r"montage|collage|mosaic|composite|compilation|collection|\bmap\b|seal|flag|logo|locator", re.I)
cs = json.load(open("meta.json"))
fix = []
for c in cs:
    if not c.get("file") or not BAD.search(c["file"]):
        continue
    cands = [f.replace("_", " ") for f in (c.get("p18") or []) + ([c["leadImage"]] if c.get("leadImage") else [])]
    alt = next((f for f in cands if not BAD.search(f) and f != c["file"]), None)
    fix.append((c, alt))
print(len(fix), "collages;", sum(1 for _, a in fix if a), "have a single-photo alternative")
alts = [a for _, a in fix if a]
info = {}
for i in range(0, len(alts), 50):
    q = urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime",
                                "iiurlwidth": 1280, "titles": "|".join("File:" + f for f in alts[i:i + 50])})
    for attempt in range(6):
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request("https://commons.wikimedia.org/w/api.php?" + q, headers={"User-Agent": UA}), timeout=60))
            break
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(120)
    for p in d["query"]["pages"].values():
        if "imageinfo" not in p: continue
        ii = p["imageinfo"][0]; em = ii.get("extmetadata", {})
        val = lambda k: re.sub(r"<[^>]+>", "", em.get(k, {}).get("value", "")).strip()
        info[p["title"][5:]] = {"thumb": ii.get("thumburl"), "width": ii.get("thumbwidth"), "height": ii.get("thumbheight"), "mime": ii.get("mime"),
                                "page": ii.get("descriptionurl"), "author": val("Artist") or val("Credit"), "license": val("LicenseShortName"),
                                "licenseUrl": val("LicenseUrl"), "attributionRequired": val("AttributionRequired"), "nonFree": val("NonFree")}
n = 0
for c, alt in fix:
    if alt and alt in info:
        c["replacedCollage"] = c["file"]; c["file"] = alt; c["image"] = info[alt]; n += 1
json.dump(cs, open("meta.json", "w"), indent=1)
print("replaced", n)
for c, alt in fix:
    print(" ", c["city"], c["state"][:2], "->", c["file"] if alt else "(kept, no alternative)")
