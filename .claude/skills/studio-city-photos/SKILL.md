---
name: studio-city-photos
description: How the US city photo library works and how to rebuild, extend or fix it (Wikimedia Commons photos for every US city with 50k+ people, Census coordinates for nearest-city matching, licences/credits). Use when photos are missing/wrong or the library needs refreshing.
---

# City photo library

Files: `public/photos/cities/{index.json, places.json, <id>.jpg, thumbs/<id>.jpg}`.
Code: `src/studio/photos/cities.ts` (+ `location.ts`). Build scripts + how-to:
`scripts/city-photos/README.md`.

- **Coverage**: every incorporated US place with ≥ 50,000 people (Census 2024 estimates,
  ~817 cities). Each has one photo (Wikidata "image" property, else the Wikipedia lead image).
- **Licences**: all free (CC0 / public domain / CC BY / CC BY-SA). The author, licence and
  source link are stored per photo and shown on the element in the editor. CC BY-SA photos
  require credit if anyone asks — the credit travels with the design.
- **Matching**: exact city → nearest library city in the same state (by coordinates from
  the Census Gazetteer, `places.json`) → the state's largest city. Users can pin another.
- **Rebuilding**: Wikimedia rate-limits cloud machines hard (HTTP 429). The scripts pace
  themselves and resume (existing files are skipped) — just re-run `download.py`.
- **Swap a bad photo**: replace `<id>.jpg` (1280px wide JPEG) and `thumbs/<id>.jpg` (400px),
  update that entry's `credit` in `index.json`.
