import { useEffect, useState } from 'react';
import PixelIcon from './PixelIcon';
import ThemeToggle from './ThemeToggle';
import { FloorPicker, FreeUntil, LiveEyebrow, NowRow, SearchBox, TimeTravel } from './controls';
import type { CampusMoment, Meeting, Room } from '../types';
import { formatMinutes } from '../lib/time';

export interface ControlProps {
  moment: CampusMoment;
  live: boolean;
  onTimeTravel: (m: { date: string; minutes: number } | null) => void;
  activeClasses: number;
  activeEvents: number;
  query: string;
  onQuery: (q: string) => void;
  results: Meeting[];
  /** Selects a room and moves the map to it (search results, free rooms). */
  onPickRoom: (key: string) => void;
  floors: number[];
  floor: number;
  onFloor: (f: number) => void;
  activeByFloor: Map<number, number>;
  /** Minutes since midnight a room must stay free until; null when the filter is off. */
  freeUntil: number | null;
  onFreeUntil: (minutes: number | null) => void;
  /** Free rooms on this floor, nearest the middle of the map first; `until` is when each is next booked (null: not again today). */
  freeOnFloor: { room: Room; until: number | null }[];
  freeByFloor: Map<number, number>;
  sourceLabel: string;
  hasInstructors: boolean;
  /** Set when the viewed date falls outside the downloaded schedule window. */
  outOfRange: string | null;
}

/** The floating control card used on wider screens; phones use MobileShell instead. */
export default function ControlCard(p: ControlProps) {
  const [timeOpen, setTimeOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [focusSearch, setFocusSearch] = useState(0);

  // ⌘K / Ctrl+K jumps to search from anywhere, unfolding the card if needed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setCollapsed(false);
      setFocusSearch((n) => n + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtering = p.freeUntil !== null;

  return (
    <section className={`card${collapsed ? ' card--collapsed' : ''}`} aria-label="Map controls">
      <header className="card__head">
        <div>
          <LiveEyebrow live={p.live} sourceLabel={p.sourceLabel} />
          <h1 className="logo">UTD Course Map</h1>
          {collapsed && (
            <p className="mono card__summary">
              {formatMinutes(p.moment.minutes)} · Floor {p.floor}
              {filtering ? ` · free until ${formatMinutes(p.freeUntil!)}` : ''}
              {p.query.trim() ? ` · “${p.query.trim()}”` : ''}
            </p>
          )}
        </div>
        <div className="card__tools">
          <ThemeToggle />
          <button
            className="icon-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-controls="card-body"
            aria-label={collapsed ? 'Show controls' : 'Hide controls'}
            title={collapsed ? 'Show controls' : 'Hide controls'}
          >
            <PixelIcon name="up" className="card__chevron" />
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="card__body" id="card-body">
          <NowRow
            moment={p.moment}
            activeClasses={p.activeClasses}
            activeEvents={p.activeEvents}
            timeOpen={timeOpen}
            onToggleTime={() => setTimeOpen((o) => !o)}
          />
          {timeOpen && <TimeTravel moment={p.moment} live={p.live} onTimeTravel={p.onTimeTravel} />}
          <FloorPicker
            floors={p.floors}
            floor={p.floor}
            onFloor={p.onFloor}
            counts={filtering ? p.freeByFloor : p.activeByFloor}
            freeUntil={p.freeUntil}
            variant="row"
          />
          <FreeUntil
            moment={p.moment}
            floor={p.floor}
            freeUntil={p.freeUntil}
            onFreeUntil={p.onFreeUntil}
            freeOnFloor={p.freeOnFloor}
            onPickRoom={p.onPickRoom}
            variant="select"
          />
          <SearchBox
            query={p.query}
            onQuery={p.onQuery}
            results={p.results}
            moment={p.moment}
            hasInstructors={p.hasInstructors}
            onPickRoom={p.onPickRoom}
            focusSignal={focusSearch}
            variant="card"
          />
          {p.outOfRange && <p className="card__warn">{p.outOfRange}</p>}
        </div>
      )}
    </section>
  );
}
