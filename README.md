# UTD Course Map

An interactive map of the UT Dallas campus that shows what's happening in every bookable room right now: classes, club meetings and other events.

- Every bookable room (classrooms, conference and meeting rooms, labs, auditoriums) is drawn at its real location and shape, from UTD's official campus map, and labeled with its room number. Orange means a class is on, blue means an event (a club meeting, department event or other reservation), and amber means something starts within 20 minutes. Hover a room to see what's in it.
- The map shows one floor at a time. Rooms on different floors share the same footprint, so they'd overlap otherwise. Pick a floor (1–4); each button shows how many rooms on it are in use. The map opens on floor 2, where most classes are, and choosing a search result on another floor switches to it.
- Click a room to see its type, capacity and full schedule for the day on a timeline. Overlapping bookings sit side by side. Step through other days with the arrows.
- Search by course (`cs 3345`), event name (`toastmasters`), room (`ECSS 2.410`) or title (and instructor, when the data source has them). Matching rooms are highlighted, and picking a result flies to that room.
- Tap the clock to time-travel to any date or time. The live view follows campus time (America/Chicago) wherever you are.
- Styled with the jeydinpham.com design system: warm dark theme by default, with a light "warm paper" theme behind the sun/moon toggle (saved per browser). Big Shoulders, Hanken Grotesk and Martian Mono come from Google Fonts. The one deliberate departure is on the map, which uses blue and gold from the design's pixel-art palette to tell events and "starting soon" apart from classes.

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
| `rooms.json` | Official outline, floor and location id of every room on UTD's campus map | `npm run data:rooms` (after `data:campus`), verify with `npm run check:rooms` |
| `schedule.json` | Class meetings by room | `npm run data:astra` (real) or `npm run data:sample` |

**Map data** comes from [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL) through the Overpass API. The whole basemap is drawn locally, so the app needs no tile server or map API key.

**Schedule data (real) comes from Astra Schedule**, UTD's room-booking system. Astra gives anonymous visitors a guest session, and its calendar API answers that session with every booking in every room, one day per request. The importer also downloads Astra's list of bookable rooms, so rooms with nothing booked still appear. No login or API key is needed.

```bash
npm run data:astra                          # next 14 days
ASTRA_DAYS=30 npm run data:astra            # longer window
ASTRA_START=2026-10-05 npm run data:astra   # start somewhere else
```

- The script pauses 1.5 s between days. Astra rate-limits by IP (it answers 404), so keep the window modest and run it at most about once a day, e.g. from a nightly cron or CI job.
- Astra has course codes, sections, titles, rooms, times and capacity, but **no instructor names**. Events have only a name and a booking type ("Student Organization", "Meeting"), not descriptions.
- Left out on purpose: staff desk-sharing reservations (named after individual employees), Astra's internal rows (room holds, setup/teardown windows, partition conflicts), anything marked private, and staff workstations or rooms under construction.
- Events that span several days or the whole day are split into one booking per day.
- Crosslisted sections (e.g. CS 3354 / SE 3354) are merged into one meeting, and the other codes are searchable.
- The file only covers the downloaded window. If you pick a date outside it, the app says so instead of showing an empty campus.
- Astra building `SOM` is mapped to `JSOM`. Online sections and rooms in buildings not on the map (a few residence-hall and off-site rooms) are skipped.

`npm run data:sample` writes a fake schedule for offline development instead.

## Where rooms come from

Room outlines and floors come from UTD's official campus map (map.utdallas.edu), which runs on Concept3D and has an interior layer for each building. `npm run data:rooms` downloads them into `public/data/rooms.json`, using only the rooms the official map itself shows:

- Only live entries under the map's **Interiors** categories are used. Archived revisions and floor-plan text labels (`Label 2.210 …`) are skipped.
- When a room is listed twice, the importer uses the same entry the official map's search returns: the one in the building's own category (JSOM over the JSOM3 duplicate), named after the building ("JO 2.604 (Performance Hall)" over "Performance Hall (JO 2.604)").
- Coordinates are copied exactly, with no rounding, and each room keeps its official location id.
- A room is filed under every building code that fits it, so naming differences between systems still match (Astra's `TH 2.702` is the map's `Theatre (JO 2.702)`).

**Checking it:** `npm run check:rooms` compares every room we draw against the live official map. For each one, it runs the map's own search, confirms we use the same location (skipping shapeless venue markers like "ECSS 2.102 (TI Auditorium)", as the map does), then fetches that location and compares every coordinate and the floor. Run it after refreshing either data file.

Rooms with no shape on the official map are not drawn, but they still appear in search and their schedules still open. Right now that's 38 of Astra's 376 bookable rooms: outdoor spaces (SCI Courtyard and Atrium), the Student Success Center (no interior on the official map yet), residence-hall rooms, and a few others such as ECSW 2.210, where the official map only has a text label.

## Project layout

```
scripts/                 data fetchers (OSM, campus-map rooms, Astra, sample generator)
src/lib/time.ts          campus-time helpers
src/lib/schedule.ts      indexing and "what's in this room now" logic
src/components/          CampusMap (Leaflet), RoomPanel, ControlCard
```
