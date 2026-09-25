import { useEffect, useRef, useState } from 'react';
import type { CampusMoment, Room } from '../types';
import type { ScheduleIndex } from '../lib/schedule';
import { meetingsOn, roomStatus } from '../lib/schedule';
import { formatDate, formatDuration, formatMinutes, formatRange, shiftDate, toMinutes, weekdayOf } from '../lib/time';

interface Props {
  room: Room;
  buildingName?: string;
  index: ScheduleIndex;
  moment: CampusMoment;
  onClose: () => void;
}

const PX_PER_MIN = 1.1;
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;

export default function RoomPanel({ room, buildingName, index, moment, onClose }: Props) {
  // The parent remounts this panel per room and viewed date, so this starts on the viewed day.
  const [date, setDate] = useState(moment.date);
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekday = weekdayOf(date);
  const meetings = meetingsOn(index, room.key, date, weekday);
  const isViewedDay = date === moment.date;
  const status = roomStatus(index, room.key, moment);
  const capacity = (index.byRoom.get(room.key) ?? []).find((m) => m.cap)?.cap;

  const start = Math.min(DAY_START, ...meetings.map((m) => Math.floor(toMinutes(m.start) / 60) * 60));
  const end = Math.max(DAY_END, ...meetings.map((m) => Math.ceil(toMinutes(m.end) / 60) * 60));
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  const y = (mins: number) => (mins - start) * PX_PER_MIN;

  // Scroll the current time (or the first class) into view when the day changes. Deliberately
  // not re-run on every clock tick, which would yank the list while someone is reading it.
  useEffect(() => {
    const target = isViewedDay ? moment.minutes : meetings[0] ? toMinutes(meetings[0].start) : DAY_START + 60;
    scrollRef.current?.scrollTo({ top: Math.max(0, y(target) - 120), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <aside className="panel" aria-label={`Schedule for ${room.key}`}>
      <header className="panel__head">
        <div>
          <p className="panel__eyebrow">
            {buildingName ?? room.building} · Floor {room.floor}
            {capacity ? ` · seats ${capacity}` : ''}
          </p>
          <h2 className="panel__title">
            {room.building} <span>{room.number}</span>
          </h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close room schedule">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className={`status status--${status.kind}`}>
        {status.kind === 'active' && (
          <>
            <span className="status__dot" />
            <div>
              <strong>
                {status.meeting.code}.{status.meeting.sec} in session
              </strong>
              <p>
                {status.meeting.title} · ends in {formatDuration(status.minutesLeft)}
              </p>
            </div>
          </>
        )}
        {status.kind === 'soon' && (
          <>
            <span className="status__dot" />
            <div>
              <strong>{status.meeting.code} starts in {status.minutesUntil} min</strong>
              <p>{status.meeting.title}</p>
            </div>
          </>
        )}
        {status.kind === 'free' && (
          <>
            <span className="status__dot" />
            <div>
              <strong>Free right now</strong>
              <p>
                {status.next
                  ? `Next: ${status.next.code} at ${formatMinutes(toMinutes(status.next.start))}`
                  : 'No more classes today'}
              </p>
            </div>
          </>
        )}
      </div>

      <nav className="daynav" aria-label="Choose day">
        <button className="icon-btn" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        <div className="daynav__label">
          <strong>{formatDate(date)}</strong>
          <span>
            {meetings.length} {meetings.length === 1 ? 'class' : 'classes'}
          </span>
        </div>
        <button className="icon-btn" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </nav>
      {!isViewedDay && (
        <button className="link-btn daynav__back" onClick={() => setDate(moment.date)}>
          Back to {formatDate(moment.date, true)}
        </button>
      )}

      <div className="timeline-scroll" ref={scrollRef}>
        {meetings.length === 0 ? (
          <p className="empty">No classes scheduled in this room on {formatDate(date, true)}.</p>
        ) : (
          <ol className="timeline" style={{ height: y(end) + 16 }}>
            {hours.map((h) => (
              <li key={h} className="timeline__hour" style={{ top: y(h) }} aria-hidden="true">
                <span>{formatMinutes(h).replace(':00', '')}</span>
              </li>
            ))}
            {meetings.map((m) => {
              const s = toMinutes(m.start);
              const e = toMinutes(m.end);
              const now = isViewedDay && s <= moment.minutes && moment.minutes < e;
              const past = isViewedDay && e <= moment.minutes;
              return (
                <li
                  key={`${m.code}-${m.sec}-${m.start}`}
                  className={`block${now ? ' block--now' : ''}${past ? ' block--past' : ''}`}
                  style={{ top: y(s), height: Math.max(28, (e - s) * PX_PER_MIN - 3) }}
                >
                  <div className="block__row">
                    <strong>
                      {m.code}
                      <span>.{m.sec}</span>
                    </strong>
                    <time>{formatRange(m.start, m.end)}</time>
                  </div>
                  <p className="block__title">{m.title}</p>
                  {(m.prof || m.xl?.length) && (
                    <p className="block__prof">{[m.prof, m.xl?.length ? `Also ${m.xl.join(', ')}` : ''].filter(Boolean).join(' · ')}</p>
                  )}
                </li>
              );
            })}
            {isViewedDay && moment.minutes >= start && moment.minutes <= end && (
              <li className="timeline__now" style={{ top: y(moment.minutes) }} aria-label={`Now, ${formatMinutes(moment.minutes)}`}>
                <span>{formatMinutes(moment.minutes)}</span>
              </li>
            )}
          </ol>
        )}
      </div>
    </aside>
  );
}
