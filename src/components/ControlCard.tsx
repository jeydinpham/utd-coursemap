import { useState } from 'react';
import ThemeToggle from './ThemeToggle';
import type { CampusMoment, Meeting, Room } from '../types';
import { formatDate, formatMinutes, formatRange, toMinutes } from '../lib/time';
import { isEvent, meetingLabel, roomKey } from '../lib/schedule';

interface Props {
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
  freeOnFloor: Room[];
  freeByFloor: Map<number, number>;
  sourceLabel: string;
  hasInstructors: boolean;
  /** Set when the viewed date falls outside the downloaded schedule window. */
  outOfRange: string | null;
}

/** Counts are zero-padded to two digits, per the design system's label style. */
const pad2 = (n: number) => String(n).padStart(2, '0');

const SLIDER_MIN = 6 * 60;
const SLIDER_MAX = 23 * 60;

/** Half-hour steps from just after `now` to 11 PM, keeping `chosen` listed even once it has passed. */
function untilOptions(now: number, chosen: number | null): number[] {
  const out: number[] = [];
  for (let t = Math.floor(now / 30) * 30 + 30; t <= SLIDER_MAX; t += 30) out.push(t);
  if (chosen !== null && !out.includes(chosen)) out.unshift(chosen);
  return out;
}

const FREE_LIST_MAX = 12;

export default function ControlCard(p: Props) {
  const [timeOpen, setTimeOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // Start folded on phones so the map gets the screen.
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const showResults = focused && p.query.trim().length > 0;
  const filtering = p.freeUntil !== null;
  const floorCounts = filtering ? p.freeByFloor : p.activeByFloor;

  return (
    <section className={`card${collapsed ? ' card--collapsed' : ''}`} aria-label="Map controls">
      <header className="card__head">
        <div>
          <p className="mono eyebrow">
            <i aria-hidden="true" className={p.live ? '' : 'eyebrow__dot--off'} />
            {p.live ? 'Live' : 'Time travel'} · {p.sourceLabel}
          </p>
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
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="card__chevron">
              <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="card__body" id="card-body">
          <div className="now">
            <button className="clock" onClick={() => setTimeOpen((o) => !o)} aria-expanded={timeOpen} aria-controls="time-travel">
              <span className="clock__time">{formatMinutes(p.moment.minutes)}</span>
              <span className="mono">
                {formatDate(p.moment.date, true)} · {timeOpen ? 'Done ↑' : 'Change ↓'}
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

          {timeOpen && (
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
          )}

          <div className="floors" role="radiogroup" aria-label="Floor">
            <span className="mono floors__label">Floor</span>
            {p.floors.map((f) => {
              const n = floorCounts.get(f) ?? 0;
              return (
                <button
                  key={f}
                  role="radio"
                  aria-checked={p.floor === f}
                  className={`floors__btn${p.floor === f ? ' floors__btn--on' : ''}`}
                  onClick={() => p.onFloor(f)}
                  title={`${n} ${n === 1 ? 'room' : 'rooms'} ${filtering ? `free until ${formatMinutes(p.freeUntil!)}` : 'in use'}`}
                >
                  <strong>{f}</strong>
                  {n > 0 && <span>{pad2(n)}</span>}
                </button>
              );
            })}
          </div>

          <div className="freeuntil">
            <label className="freeuntil__row">
              <span className="mono">Free until</span>
              <select
                value={p.freeUntil ?? ''}
                onChange={(e) => p.onFreeUntil(e.target.value ? Number(e.target.value) : null)}
                aria-label="Show rooms that stay free until"
              >
                <option value="">Any time</option>
                {untilOptions(p.moment.minutes, p.freeUntil).map((t) => (
                  <option key={t} value={t}>
                    {formatMinutes(t)}
                  </option>
                ))}
              </select>
              {filtering && (
                <button className="link mono" onClick={() => p.onFreeUntil(null)}>
                  Clear
                </button>
              )}
            </label>
            {filtering && (
              <>
                <p className="mono freeuntil__count">
                  {pad2(p.freeOnFloor.length)} {p.freeOnFloor.length === 1 ? 'room' : 'rooms'} on floor {p.floor} free until{' '}
                  {formatMinutes(p.freeUntil!)}
                </p>
                {p.freeOnFloor.length > 0 && (
                  <ul className="freeuntil__rooms">
                    {p.freeOnFloor.slice(0, FREE_LIST_MAX).map((r) => (
                      <li key={r.key}>
                        <button className="chip mono" onClick={() => p.onPickRoom(r.key)}>
                          {r.key}
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

          <div className="search">
            <svg className="search__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" fill="none" />
              <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder={p.hasInstructors ? 'Find a course, event, room or instructor' : 'Find a course, event or room'}
              value={p.query}
              onChange={(e) => p.onQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              // Delay so a click on a result registers before the list closes.
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              aria-label={p.hasInstructors ? 'Search courses, events, rooms or instructors' : 'Search courses, events or rooms'}
            />
            {showResults && (
              <ul className="results" role="listbox">
                {p.results.length === 0 && <li className="mono results__empty">Nothing matches on {formatDate(p.moment.date, true)}</li>}
                {p.results.map((m) => {
                  const now = toMinutes(m.start) <= p.moment.minutes && p.moment.minutes < toMinutes(m.end);
                  return (
                    <li key={`${m.b}${m.r}${m.code}${m.sec}${m.start}`}>
                      <button role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                          p.onPickRoom(roomKey(m.b, m.r));
                          setFocused(false);
                        }}>
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

          {p.outOfRange && <p className="card__warn">{p.outOfRange}</p>}
        </div>
      )}
    </section>
  );
}
