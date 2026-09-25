# UTD Course Map

An interactive map of the UT Dallas campus that shows what's being taught in every classroom right now.

- Each classroom is drawn at its real location and shape, from UTD's official campus map. Tiles are labeled with the room number. Rooms in session are orange and rooms with a class starting within 20 minutes are amber. Hover a room to see its class.
- The map shows one floor at a time. Rooms on different floors share the same footprint, so they'd overlap otherwise. Pick a floor (1–4); each button shows how many classes are in session on it. The map opens on floor 2, where most classes are, and choosing a search result on another floor switches to it.
- Click a room to see its full schedule for the day on a timeline. Step through other days with the arrows.
- Search by course (`cs 3345`), room (`ECSS 2.410`) or title (and instructor, when the data source has them). Matching rooms are highlighted, and picking a result flies to that room.
- Tap the clock to time-travel to any date or time. The live view follows campus time (America/Chicago) wherever you are.
- Light and dark themes follow your system setting.

## Running it

```bash
npm install
npm run dev
```

## Data

Everything the app reads lives in `public/data/`:

| File | What it is | How to regenerate |
| --- | --- | --- |
| `buildings.json` | Named campus buildings and their footprints | `npm run data:campus` |
| `campus.json` | Roads, paths, parking, lawns and water for the basemap | `npm run data:campus` |
| `rooms.json` | Real outline and floor of every room in UTD's official campus map | `npm run data:rooms` (after `data:campus`) |
| `schedule.json` | Class meetings by room | `npm run data:astra` (real) or `npm run data:sample` |

**Map data** comes from [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL) through the Overpass API. The whole basemap is drawn locally, so the app needs no tile server or map API key.

**Schedule data (real) comes from Astra Schedule**, UTD's room-booking system. Astra gives anonymous visitors a guest session, and its calendar API answers that session with every class meeting booked in every room, one day per request. No login or API key is needed.

```bash
npm run data:astra                          # next 14 days
ASTRA_DAYS=30 npm run data:astra            # longer window
ASTRA_START=2026-10-05 npm run data:astra   # start somewhere else
```

- The script pauses 1.5 s between days. Astra rate-limits by IP (it answers 404), so keep the window modest and run it at most about once a day, e.g. from a nightly cron or CI job.
- Astra has course codes, sections, titles, rooms, times and capacity, but **no instructor names**.
- Crosslisted sections (e.g. CS 3354 / SE 3354) are merged into one meeting, and the other codes are searchable.
- The file only covers the downloaded window. If you pick a date outside it, the app says so instead of showing an empty campus.
- Astra building `SOM` is mapped to `JSOM`. Online sections and rooms in buildings not on the map (a few residence-hall and off-site rooms) are skipped.

`npm run data:sample` writes a fake schedule for offline development instead.

## Where rooms come from

Room outlines and floors come from UTD's official campus map (map.utdallas.edu), which runs on Concept3D and has an interior layer for each building. `scripts/fetch-rooms.mjs` downloads those rooms through the map's public API. Each room is filed under the building named in its label, the OpenStreetMap footprint it sits in, and its map category, so small naming differences between systems still match (Astra's `TH 2.702` is the map's `Theatre (JO 2.702)`). When the map's floor disagrees with the room number, the map wins.

Classrooms with no location on the campus map are not drawn (currently only SPN 1.221), but they still show up in search and their schedules still open. The browser console lists them.

## Project layout

```
scripts/                 data fetchers (OSM, campus-map rooms, Astra, sample generator)
src/lib/time.ts          campus-time helpers
src/lib/schedule.ts      indexing and "what's in this room now" logic
src/components/          CampusMap (Leaflet), RoomPanel, ControlCard
```
