import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Building, CampusFeature, CampusMoment, LatLng, Room, RoomShape } from '../types';
import type { ScheduleIndex } from '../lib/schedule';
import { roomStatus } from '../lib/schedule';
import { formatMinutes, toMinutes } from '../lib/time';
import { useColorScheme } from '../lib/useColorScheme';

const CAMPUS_CENTER: LatLng = [32.9866, -96.7502];
/** Opening view: the main academic core (ECS, SLC, FO, JSOM) at a zoom where room numbers are legible. */
const START_VIEW: { center: LatLng; zoom: number } = { center: [32.98635, -96.7498], zoom: 18.5 };
/** Below this zoom, rooms are hidden and buildings show a summary badge instead. */
const ROOM_ZOOM = 17;
/** Minimum on-screen room size (px) before its number is drawn. */
const LABEL_MIN_W = 36;
const LABEL_MIN_H = 12;

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * How each background feature is drawn. Colors come from CSS variables so the
 * basemap follows the light/dark theme; widths are meters-ish at zoom 17 and
 * scale with zoom like real streets would.
 */
const BASEMAP_STYLE: Record<CampusFeature['kind'], { area: boolean; color: string; width?: number }> = {
  green: { area: true, color: '--map-green' },
  water: { area: true, color: '--map-water' },
  parking: { area: true, color: '--map-parking' },
  building: { area: true, color: '--map-building' },
  service: { area: false, color: '--map-road', width: 2 },
  path: { area: false, color: '--map-path', width: 1.2 },
  road: { area: false, color: '--map-road', width: 5 },
};
const DRAW_ORDER: CampusFeature['kind'][] = ['green', 'water', 'parking', 'building', 'path', 'service', 'road'];

interface Props {
  campus: CampusFeature[];
  buildings: Building[];
  index: ScheduleIndex;
  /** Real room outlines from the campus map, keyed like "ECSS 2.410". */
  shapes: Map<string, RoomShape>;
  /** Rooms on the chosen floor that have an outline. */
  visibleRooms: Room[];
  /** Buildings that have classrooms on any floor. */
  academic: Set<string>;
  /** Buildings that have classrooms on the chosen floor. */
  floorBuildings: Set<string>;
  moment: CampusMoment;
  selectedKey: string | null;
  /** Room keys matching the search box, or null when not searching. */
  highlight: Set<string> | null;
  /** Changing this value flies the map to that room. */
  focus: { key: string; n: number } | null;
  onSelectRoom: (key: string | null) => void;
}

interface RoomLayer {
  key: string;
  building: string;
  number: string;
  tile: L.Polygon;
  label: L.Marker;
  center: L.LatLng;
  /** Room width / height in meters, used to size the label. */
  wM: number;
  hM: number;
}

interface BuildingLayer {
  code: string;
  shape: L.Polygon;
  badge: L.Marker;
  hasRooms: boolean;
  center: L.LatLngExpression;
  top: L.LatLngExpression;
}

export default function CampusMap({ campus, buildings, index, shapes, visibleRooms, academic, floorBuildings, moment, selectedKey, highlight, focus, onSelectRoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const roomsRef = useRef<RoomLayer[]>([]);
  const buildingsRef = useRef<BuildingLayer[]>([]);
  const onSelectRef = useRef(onSelectRoom);
  useEffect(() => {
    onSelectRef.current = onSelectRoom;
  }, [onSelectRoom]);
  const scheme = useColorScheme();

  // Create the map once.
  useEffect(() => {
    const map = L.map(containerRef.current!, {
      center: START_VIEW.center,
      zoom: START_VIEW.zoom,
      minZoom: 15,
      maxZoom: 20,
      zoomSnap: 0.5,
      maxBounds: L.latLngBounds([32.972, -96.772], [33.002, -96.73]),
      zoomControl: false,
      attributionControl: true,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix(false).addAttribution(ATTRIBUTION);
    map.on('click', () => onSelectRef.current(null));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw roads, paths, lawns and parking on a canvas under everything else, re-coloured per theme.
  useEffect(() => {
    const map = mapRef.current!;
    const css = getComputedStyle(document.documentElement);
    const renderer = L.canvas({ pane: 'tilePane', padding: 0.3 });
    const groups = new Map<CampusFeature['kind'], L.FeatureGroup>();
    for (const kind of DRAW_ORDER) groups.set(kind, L.featureGroup().addTo(map));

    for (const f of campus) {
      const style = BASEMAP_STYLE[f.kind];
      const color = css.getPropertyValue(style.color).trim();
      const opts = { renderer, interactive: false, color, fillColor: color };
      const layer = style.area
        ? L.polygon(f.pts, { ...opts, stroke: false, fillOpacity: 1 })
        : L.polyline(f.pts, { ...opts, weight: style.width, lineCap: 'round', lineJoin: 'round' });
      layer.addTo(groups.get(f.kind)!);
    }

    const scaleLines = () => {
      const k = 2 ** (map.getZoom() - 17);
      for (const kind of ['path', 'service', 'road'] as const) {
        groups.get(kind)!.setStyle({ weight: Math.max(1, BASEMAP_STYLE[kind].width! * k) });
      }
    };
    map.on('zoomend', scaleLines);
    scaleLines();

    return () => {
      map.off('zoomend', scaleLines);
      for (const g of groups.values()) g.remove();
    };
  }, [campus, scheme]);

  // Build building + room layers whenever the data changes.
  useEffect(() => {
    const map = mapRef.current!;
    const group = L.layerGroup().addTo(map);
    const roomGroup = L.layerGroup().addTo(map);
    const blayers: BuildingLayer[] = [];
    const rlayers: RoomLayer[] = [];

    for (const b of buildings) {
      const hasRooms = academic.has(b.code);
      const shape = L.polygon(b.rings, {
        className: `building${hasRooms ? ' building--academic' : ''}`,
        interactive: hasRooms,
      }).addTo(group);
      const top = b.rings[0].reduce((best, p) => (p[0] > best[0] ? p : best));
      const center = shape.getBounds().getCenter();
      const badge = L.marker(hasRooms ? center : top, {
        icon: L.divIcon({ className: 'building-badge-wrap', html: '', iconSize: undefined }),
        interactive: hasRooms,
        keyboard: false,
      }).addTo(group);
      if (hasRooms) {
        const zoomIn = () => map.flyToBounds(shape.getBounds(), { maxZoom: 19, padding: [40, 40], duration: 0.6 });
        shape.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (map.getZoom() < ROOM_ZOOM) zoomIn();
        });
        badge.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          zoomIn();
        });
        shape.bindTooltip(b.name, { sticky: true, className: 'map-tooltip', direction: 'top', offset: [0, -8] });
      }
      blayers.push({ code: b.code, shape, badge, hasRooms, center, top });
    }

    for (const room of visibleRooms) {
      const s = shapes.get(room.key)!;
      const tile = L.polygon(s.outline, { className: 'room', bubblingMouseEvents: false }).addTo(roomGroup);
      const c = L.latLng(s.center);
      const label = L.marker(c, {
        icon: L.divIcon({ className: 'room-label', html: '', iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(roomGroup);
      tile.on('click', () => onSelectRef.current(room.key));
      tile.bindTooltip('', { sticky: true, className: 'map-tooltip', direction: 'top', offset: [0, -10] });
      rlayers.push({ key: room.key, building: room.building, number: room.number, tile, label, center: c, wM: s.widthM, hM: s.heightM });
    }

    roomsRef.current = rlayers;
    buildingsRef.current = blayers;

    // Size labels to their room and hide them when there isn't room to read them.
    const onZoom = () => {
      const z = map.getZoom();
      const showRooms = z >= ROOM_ZOOM;
      map.getContainer().classList.toggle('show-rooms', showRooms);
      // Badges sit mid-building when zoomed out, then move to the top edge so they don't cover rooms.
      for (const b of blayers) if (b.hasRooms) b.badge.setLatLng(showRooms ? b.top : b.center);
      const mPerPx = (40_075_016 * Math.cos((CAMPUS_CENTER[0] * Math.PI) / 180)) / 2 ** (z + 8);
      for (const r of rlayers) {
        const el = r.label.getElement();
        if (!el) continue;
        const w = r.wM / mPerPx;
        const h = r.hM / mPerPx;
        el.style.setProperty('--w', `${w}px`);
        el.style.setProperty('--h', `${h}px`);
        el.classList.toggle('room-label--hidden', !showRooms || w < LABEL_MIN_W || h < LABEL_MIN_H);
        el.classList.toggle('room-label--compact', w < 60);
      }
    };
    map.on('zoomend', onZoom);
    onZoom();

    return () => {
      map.off('zoomend', onZoom);
      group.remove();
      roomGroup.remove();
    };
  }, [buildings, shapes, visibleRooms, academic]);

  // Restyle rooms and building badges for the current moment / selection / search.
  useEffect(() => {
    const activeByBuilding = new Map<string, number>();
    for (const r of roomsRef.current) {
      const status = roomStatus(index, r.key, moment);
      const el = r.tile.getElement();
      const dim = highlight !== null && !highlight.has(r.key);
      if (el) {
        el.classList.toggle('room--active', status.kind === 'active');
        el.classList.toggle('room--soon', status.kind === 'soon');
        el.classList.toggle('room--selected', r.key === selectedKey);
        el.classList.toggle('room--dim', dim);
        el.classList.toggle('room--match', highlight !== null && !dim);
      }
      if (status.kind === 'active') activeByBuilding.set(r.building, (activeByBuilding.get(r.building) ?? 0) + 1);

      // Tiles are labelled with the room number; colour carries the status and the tooltip names the class.
      const html = `<span>${r.number}</span>`;
      let tip: string;
      if (status.kind === 'active') {
        tip = `<b>${r.key}</b><br>${status.meeting.code}.${status.meeting.sec} · until ${formatMinutes(toMinutes(status.meeting.end))}`;
      } else if (status.kind === 'soon') {
        tip = `<b>${r.key}</b><br>${status.meeting.code} starts at ${formatMinutes(toMinutes(status.meeting.start))}`;
      } else {
        tip = `<b>${r.key}</b><br>${status.next ? `Free until ${formatMinutes(toMinutes(status.next.start))}` : 'Free for the rest of the day'}`;
      }
      const labelEl = r.label.getElement();
      if (labelEl) {
        const inner = `<div class="room-label__box">${html}</div>`;
        if (labelEl.innerHTML !== inner) labelEl.innerHTML = inner;
        labelEl.classList.toggle('room-label--active', status.kind === 'active');
        labelEl.classList.toggle('room-label--dim', dim);
      }
      r.tile.setTooltipContent(tip);
    }

    for (const b of buildingsRef.current) {
      const el = b.badge.getElement();
      if (!el) continue;
      const n = activeByBuilding.get(b.code) ?? 0;
      // Buildings with no classrooms on the chosen floor fade back.
      const empty = !floorBuildings.has(b.code);
      el.innerHTML = b.hasRooms
        ? `<div class="building-badge${n ? ' building-badge--busy' : ''}${empty ? ' building-badge--empty' : ''}"><b>${b.code}</b>${
            n ? `<span>${n} in class</span>` : ''
          }</div>`
        : `<div class="building-code">${b.code}</div>`;
    }
  }, [index, moment, selectedKey, highlight, buildings, visibleRooms, floorBuildings]);

  // Fly to a room picked from search.
  useEffect(() => {
    if (!focus) return;
    const map = mapRef.current!;
    const r = roomsRef.current.find((x) => x.key === focus.key);
    if (!r) return;
    // Aim off-centre so the room isn't hidden behind the schedule panel
    // (a bottom sheet on phones, a right-hand column on wider screens).
    const zoom = Math.max(map.getZoom(), 19);
    const size = map.getSize();
    const shift = size.x < 720 ? L.point(0, size.y * 0.18) : L.point(190, 0);
    map.flyTo(map.unproject(map.project(r.center, zoom).add(shift), zoom), zoom, { duration: 0.8 });
  }, [focus]);

  return <div ref={containerRef} className="map" role="application" aria-label="UT Dallas campus map" />;
}
