import { useState } from 'react';
import type { CampusMoment, Meeting } from '../types';
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
  onPickResult: (m: Meeting) => void;
  floors: number[];
  floor: number;
  onFloor: (f: number) => void;
  activeByFloor: Map<number, number>;
  sourceLabel: string;
  hasInstructors: boolean;
  /** Set when the viewed date falls outside the downloaded schedule window. */
  outOfRange: string | null;
}

const SLIDER_MIN = 6 * 60;
const SLIDER_MAX = 23 * 60;

export default function ControlCard(p: Props) {
  const [timeOpen, setTimeOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const showResults = focused && p.query.trim().length > 0;

  return (
    <section className="card" aria-label="Map controls">
      <div className="card__head">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <div>
            <h1>UTD Course Map</h1>
            <p>{p.sourceLabel}</p>
          </div>
        </div>
        <button
          className={`clock${p.live ? ' clock--live' : ''}`}
          onClick={() => setTimeOpen((o) => !o)}
          aria-expanded={timeOpen}
          aria-controls="time-travel"
        >
          <span className="clock__dot" aria-hidden="true" />
          <span className="clock__text">
            <strong>{formatMinutes(p.moment.minutes)}</strong>
            <span>{p.live ? 'Live' : formatDate(p.moment.date, true)}</span>
          </span>
        </button>
      </div>

      {timeOpen && (
        <div className="timetravel" id="time-travel">
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={p.moment.date}
              onChange={(e) => e.target.value && p.onTimeTravel({ date: e.target.value, minutes: p.moment.minutes })}
            />
          </label>
          <label className="field field--grow">
            <span>
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
          <button className="btn" disabled={p.live} onClick={() => p.onTimeTravel(null)}>
            Back to live
          </button>
        </div>
      )}

      <div className="floors" role="radiogroup" aria-label="Floor">
        <span className="floors__label">Floor</span>
        {p.floors.map((f) => {
          const n = p.activeByFloor.get(f) ?? 0;
          return (
            <button
              key={f}
              role="radio"
              aria-checked={p.floor === f}
              className={`floors__btn${p.floor === f ? ' floors__btn--on' : ''}`}
              onClick={() => p.onFloor(f)}
              title={`${n} ${n === 1 ? 'room' : 'rooms'} in use`}
            >
              <strong>{f}</strong>
              {n > 0 && <span>{n}</span>}
            </button>
          );
        })}
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
            {p.results.length === 0 && <li className="results__empty">Nothing matches on {formatDate(p.moment.date, true)}</li>}
            {p.results.map((m) => {
              const now = toMinutes(m.start) <= p.moment.minutes && p.moment.minutes < toMinutes(m.end);
              return (
                <li key={`${m.b}${m.r}${m.code}${m.sec}${m.start}`}>
                  <button role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                      p.onPickResult(m);
                      setFocused(false);
                    }}>
                    <span className="results__main">
                      {isEvent(m) && <span className="results__tag">Event</span>}
                      <strong>{meetingLabel(m)}</strong> {m.title}
                    </span>
                    <span className="results__meta">
                      {now && <em>Now</em>}
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
      <p className="card__stat">
        <strong>{p.activeClasses}</strong> {p.activeClasses === 1 ? 'class' : 'classes'} and{' '}
        <strong className="card__stat-event">{p.activeEvents}</strong> {p.activeEvents === 1 ? 'event' : 'events'}
        {p.live ? ' right now' : ` at ${formatMinutes(p.moment.minutes)}`}
      </p>
    </section>
  );
}
