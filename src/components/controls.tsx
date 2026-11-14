// Controls shared by the desktop card and the phone layout: the live clock and
// counts, time travel, floor picker, the "free until" filter, search and the legend.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyEvent } from 'react';
import PixelIcon from './PixelIcon';
import type { CampusMoment, Meeting, Room } from '../types';
import { formatDate, formatMinutes, formatRange, toMinutes } from '../lib/time';
import { isEvent, meetingLabel, roomKey } from '../lib/schedule';
import { pad2 } from '../lib/format';

const SLIDER_MIN = 6 * 60;
const SLIDER_MAX = 23 * 60;
const FREE_LIST_MAX = 12;

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** Half-hour steps from just after `now` to 11 PM, keeping `chosen` listed even once it has passed. */
function untilOptions(now: number, chosen: number | null): number[] {
  const out: number[] = [];
  for (let t = Math.floor(now / 30) * 30 + 30; t <= SLIDER_MAX; t += 30) out.push(t);
  if (chosen !== null && !out.includes(chosen)) out.unshift(chosen);
  return out;
}

export function LiveEyebrow({ live, sourceLabel }: { live: boolean; sourceLabel: string }) {
  return (
    <p className="mono eyebrow">
      <i aria-hidden="true" className={live ? '' : 'eyebrow__dot--off'} />
      {live ? 'Live' : 'Time travel'} · {sourceLabel}
    </p>
  );
}

export function NowRow(p: {
  moment: CampusMoment;
  activeClasses: number;
  activeEvents: number;
  timeOpen: boolean;
  onToggleTime: () => void;
}) {
  return (
    <div className="now">
      <button className="clock" onClick={p.onToggleTime} aria-expanded={p.timeOpen} aria-controls="time-travel">
        <span className="clock__time">{formatMinutes(p.moment.minutes)}</span>
        <span className="mono">
          {formatDate(p.moment.date, true)} · {p.timeOpen ? 'Done ↑' : 'Change ↓'}
        </span>
      </button>
      <dl className="tally">
        <div>
          <dt className="mono">{p.activeClasses === 1 ? 'Class' : 'Classes'}</dt>
          <dd className="tally__n">{pad2(p.activeClasses)}</dd>
        </div>
        <div>
          <dt className="mono">{p.activeEvents === 1 ? 'Event' : 'Events'}</dt>
          <dd className="tally__n tally__n--event">{pad2(p.activeEvents)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function TimeTravel(p: {
  moment: CampusMoment;
  live: boolean;
  onTimeTravel: (m: { date: string; minutes: number } | null) => void;
}) {
  return (
    <div className="timetravel" id="time-travel">
      <label className="field">
        <span className="mono">Date</span>
        <input
          type="date"
          value={p.moment.date}
          onChange={(e) => e.target.value && p.onTimeTravel({ date: e.target.value, minutes: p.moment.minutes })}
        />
      </label>
      <label className="field field--grow">
        <span className="mono">
          Time <output>{formatMinutes(p.moment.minutes)}</output>
        </span>
        <input
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={5}
          value={Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, p.moment.minutes))}
          onChange={(e) => p.onTimeTravel({ date: p.moment.date, minutes: Number(e.target.value) })}
        />
      </label>
      <button className="btn primary" disabled={p.live} onClick={() => p.onTimeTravel(null)}>
        Back to live <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

/**
 * Floor buttons with a count of rooms in use (or free, while the free-until filter is on).
 * "row" is the desktop card's segmented row; "rail" is the phone's elevator-style column.
 */
export function FloorPicker(p: {
  floors: number[];
  floor: number;
  onFloor: (f: number) => void;
  counts: Map<number, number>;
  freeUntil: number | null;
  variant: 'row' | 'rail';
}) {
  const floors = p.variant === 'rail' ? [...p.floors].reverse() : p.floors;
  return (
    <div className={p.variant === 'rail' ? 'floor-rail' : 'floors'} role="radiogroup" aria-label="Floor">
      {p.variant === 'row' && <span className="mono floors__label">Floor</span>}
      {floors.map((f) => {
        const n = p.counts.get(f) ?? 0;
        const on = p.floor === f;
        return (
          <button
            key={f}
            role="radio"
            aria-checked={on}
            className={`floors__btn${on ? ' floors__btn--on' : ''}`}
            onClick={() => p.onFloor(f)}
            aria-label={`Floor ${f}, ${n} ${n === 1 ? 'room' : 'rooms'} ${p.freeUntil !== null ? `free until ${formatMinutes(p.freeUntil)}` : 'in use'}`}
            title={`${n} ${n === 1 ? 'room' : 'rooms'} ${p.freeUntil !== null ? `free until ${formatMinutes(p.freeUntil)}` : 'in use'}`}
          >
            <strong>{f}</strong>
            {n > 0 && <span>{pad2(n)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shows rooms that stay free until a chosen time, plus the free rooms on this floor nearest
 * the map's centre. "select" is a dropdown (desktop); "chips" is a swipeable row (phones).
 */
export function FreeUntil(p: {
  moment: CampusMoment;
  floor: number;
  freeUntil: number | null;
  onFreeUntil: (minutes: number | null) => void;
  freeOnFloor: { room: Room; until: number | null }[];
  onPickRoom: (key: string) => void;
  variant: 'select' | 'chips';
}) {
  const filtering = p.freeUntil !== null;
  const options = untilOptions(p.moment.minutes, p.freeUntil);
  return (
    <div className="freeuntil">
      {p.variant === 'select' ? (
        <label className="freeuntil__row">
          <span className="mono">Free until</span>
          <span className="freeuntil__select">
            <select
              value={p.freeUntil ?? ''}
              onChange={(e) => p.onFreeUntil(e.target.value ? Number(e.target.value) : null)}
              aria-label="Show rooms that stay free until"
            >
              <option value="">Any time</option>
              {options.map((t) => (
                <option key={t} value={t}>
                  {formatMinutes(t)}
                </option>
              ))}
            </select>
            <PixelIcon name="up" className="freeuntil__arrow" />
          </span>
          {filtering && (
            <button className="link mono" onClick={() => p.onFreeUntil(null)}>
              Clear
            </button>
          )}
        </label>
      ) : (
        <div className="freeuntil__chips-wrap">
          <span className="mono">Find a free room until</span>
          <div className="chip-row" role="radiogroup" aria-label="Show rooms that stay free until">
            <button role="radio" aria-checked={!filtering} className={`chip${!filtering ? ' chip--on' : ''}`} onClick={() => p.onFreeUntil(null)}>
              Off
            </button>
            {options.map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={p.freeUntil === t}
                className={`chip${p.freeUntil === t ? ' chip--on' : ''}`}
                onClick={() => p.onFreeUntil(t)}
              >
                {formatMinutes(t)}
              </button>
            ))}
          </div>
        </div>
      )}
      {filtering && (
        <>
          <p className="mono freeuntil__count">
            {pad2(p.freeOnFloor.length)} {p.freeOnFloor.length === 1 ? 'room' : 'rooms'} on floor {p.floor} free until {formatMinutes(p.freeUntil!)}
            {p.freeOnFloor.length > 1 ? ' · nearest first' : ''}
          </p>
          {p.freeOnFloor.length > 0 && (
            <ul className={`freeuntil__rooms${p.variant === 'chips' ? ' chip-row' : ''}`}>
              {p.freeOnFloor.slice(0, FREE_LIST_MAX).map(({ room, until }) => (
                <li key={room.key}>
                  <button className="chip" onClick={() => p.onPickRoom(room.key)}>
                    {room.key}
                    <span className="chip__until">{until === null ? 'rest of day' : `till ${formatMinutes(until)}`}</span>
                  </button>
                </li>
              ))}
              {p.freeOnFloor.length > FREE_LIST_MAX && (
                <li className="mono freeuntil__more">+{p.freeOnFloor.length - FREE_LIST_MAX} more on the map</li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Search box with a results list you can move through with ↑/↓ and pick with Enter. */
export function SearchBox(p: {
  query: string;
  onQuery: (q: string) => void;
  results: Meeting[];
  moment: CampusMoment;
  hasInstructors: boolean;
  onPickRoom: (key: string) => void;
  /** Bump to move keyboard focus into the box (the desktop ⌘K shortcut). */
  focusSignal?: number;
  /** Show the ⌘K hint (desktop) or a clear button (phones). */
  variant: 'card' | 'bar';
  onFocusChange?: (focused: boolean) => void;
}) {
  const [focused, setFocusedState] = useState(false);
  const [picked, setPicked] = useState(0);
  const localRef = useRef<HTMLInputElement | null>(null);
  const showResults = focused && p.query.trim().length > 0;

  const setFocused = (f: boolean) => {
    setFocusedState(f);
    p.onFocusChange?.(f);
  };
  useEffect(() => {
    if (p.focusSignal) localRef.current?.focus();
  }, [p.focusSignal]);

  const pick = (m: Meeting) => {
    p.onPickRoom(roomKey(m.b, m.r));
    setFocused(false);
    localRef.current?.blur();
  };

  const onKey = (e: ReactKeyEvent<HTMLInputElement>) => {
    const n = p.results.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      setFocused(true);
      setPicked((i) => (i + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      setPicked((i) => (i - 1 + n) % n);
    } else if (e.key === 'Enter' && showResults && p.results[picked]) {
      pick(p.results[picked]);
    } else if (e.key === 'Escape') {
      localRef.current?.blur();
    }
  };

  const label = p.hasInstructors ? 'Search courses, events, rooms or instructors' : 'Search courses, events or rooms';
  return (
    <div className={`search search--${p.variant}`}>
      <PixelIcon name="search" className="search__icon" />
      <input
        ref={localRef}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={p.variant === 'bar' ? 'Search courses & rooms' : p.hasInstructors ? 'Find a course, event, room or instructor' : 'Find a course, event or room'}
        value={p.query}
        onChange={(e) => {
          p.onQuery(e.target.value);
          setPicked(0);
        }}
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        // Delay so a tap on a result registers before the list closes.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        aria-label={label}
        aria-activedescendant={showResults && p.results[picked] ? `result-${picked}` : undefined}
      />
      {p.variant === 'card' && !p.query && (
        <span className="kbd-chip mono" aria-hidden="true">
          <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd>K</kbd>
        </span>
      )}
      {p.variant === 'bar' && p.query && (
        <button
          className="search__clear"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            p.onQuery('');
            localRef.current?.focus();
          }}
        >
          <PixelIcon name="close" />
        </button>
      )}
      {showResults && (
        <ul className="results" role="listbox">
          {p.results.length === 0 && <li className="mono results__empty">Nothing matches on {formatDate(p.moment.date, true)}</li>}
          {p.results.map((m, i) => {
            const now = toMinutes(m.start) <= p.moment.minutes && p.moment.minutes < toMinutes(m.end);
            return (
              <li key={`${m.b}${m.r}${m.code}${m.sec}${m.start}`}>
                <button
                  id={`result-${i}`}
                  role="option"
                  aria-selected={i === picked}
                  className={i === picked ? 'on' : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setPicked(i)}
                  onClick={() => pick(m)}
                >
                  <span className="results__main">
                    <strong>{meetingLabel(m)}</strong> {m.title}
                  </span>
                  <span className="mono results__meta">
                    {now && <em className="badge">Now</em>}
                    {isEvent(m) && <em className="tag tag--event">Event</em>}
                    {roomKey(m.b, m.r)} · {formatRange(m.start, m.end)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Legend({ className = '' }: { className?: string }) {
  return (
    <div className={`legend mono ${className}`} aria-label="Legend">
      <span>
        <i className="swatch swatch--active" /> Class
      </span>
      <span>
        <i className="swatch swatch--event" /> Event
      </span>
      <span>
        <i className="swatch swatch--soon" /> Soon
      </span>
      <span>
        <i className="swatch swatch--free" /> Free
      </span>
    </div>
  );
}
