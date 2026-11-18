# US city photo library

Builds `public/photos/cities/` — one free-licensed photo for every US city
with 50,000+ people, plus place coordinates so any town can borrow the
nearest city's photo.

Run from this folder (Python 3 + Pillow).

**Shortcut:** `meta.json` (the photo + licence list for all 817 cities, collected and
collage-checked on night 1) is already in this folder, so to finish the photos you only need
step 3 onward:

```bash
pip install pillow
python3 download.py ../../public/photos/cities
python3 places.py ../../public/photos/cities   # needs the Gazetteer file from step 1
python3 focus.py ../../public/photos/cities
```

Full rebuild from scratch:

1. Download the inputs next to the scripts:
   - Census city populations: `sub-est2024.csv` from
     https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/
     (save as `sub.csv`)
   - Census place coordinates: `2024_Gaz_place_national.zip` from
     https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/ (unzip it)
2. `python3 collect.py` (then `python3 fix_montages.py` to swap collage images for single photos) — finds each city's photo on Wikipedia/Wikidata and
   its licence on Wikimedia Commons (slow on purpose: Wikimedia rate-limits).
3. `python3 download.py ../../public/photos/cities` — downloads and resizes
   the photos (1280px + 400px thumbnails) and writes `index.json`.
4. `python3 places.py ../../public/photos/cities` — writes `places.json`
   and adds coordinates to `index.json`.

5. `python3 focus.py ../../public/photos/cities` — finds each photo's point of interest so
   crops keep the skyline in frame.

**Speed:** Wikimedia heavily rate-limits cloud servers. Run step 3 from a normal office or home
internet connection (Python 3 + `pip install pillow`) and it finishes in about an hour; it
skips photos that are already downloaded, so it can be stopped and restarted any time.

Every photo keeps its author, licence and source link in `index.json`; the
app shows that credit on any design that uses it.
