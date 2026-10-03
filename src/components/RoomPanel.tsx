import { useEffect, useRef, useState } from 'react';
import type { CampusMoment, Room } from '../types';
import type { ScheduleIndex } from '../lib/schedule';
import { isEvent, meetingLabel, meetingsOn, roomStatus } from '../lib/schedule';
import type { Meeting } from '../types';
import { formatDate, formatDuration, formatMinutes, formatRange, shiftDate, toMinutes, weekdayOf } from '../lib/time';

interface Props {
  room: Room;
  buildingName?: string;
  roomType?: string;
  index: ScheduleIndex;
  moment: CampusMoment;
  onClose: () => void;
}

const PX_PER_MIN = 1.1;

/**
 * Bookings can overlap (an all-day event and a class, say). Give each one a lane
 * so overlapping blocks sit side by side; `lanes` is how many share its cluster.
 */
function layoutLanes(meetings: Meeting[]) {
  const out: { m: Meeting; lane: number; lanes: number }[] = [];
  let cluster: { m: Meeting; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const m of meetings) {
    const s = toMinutes(m.start);
    const e = toMinutes(m.end);
    if (s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) lane = laneEnds.push(e) - 1;
    else laneEnds[lane] = e;
    cluster.push({ m, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return out;
}
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;

export default function RoomPanel({ room, buildingName, roomType, index, moment, onClose }: Props) {
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
          <p className="mono panel__eyebrow">
            {[buildingName ?? room.building, roomType, `Floor ${room.floor}`].filter(Boolean).join(' · ')}
            {capacity ? ` · seats ${capacity}` : ''}
          </p>
          <h2 className="panel__title">
            {room.building} <em className="accent">{room.number}</em>
          </h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close room schedule">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className={`status status--${status.kind}${status.kind !== 'free' && isEvent(status.meeting) ? ' status--event' : ''}`}>
        {status.kind === 'active' && (
          <>
            <p className="mono status__label">
              <em className={`badge${isEvent(status.meeting) ? ' badge--event' : ''}`}>Now</em>
              {isEvent(status.meeting) ? status.meeting.title : 'In session'} · ends in {formatDuration(status.minutesLeft)}
            </p>
            <strong className="status__what">{meetingLabel(status.meeting)}</strong>
            {!isEvent(status.meeting) && <p className="status__detail">{status.meeting.title}</p>}
          </>
        )}
        {status.kind === 'soon' && (
          <>
            <p className="mono status__label">
              <em className="badge badge--soon">Soon</em>
              Starts in {status.minutesUntil} min
            </p>
            <strong className="status__what">{meetingLabel(status.meeting)}</strong>
            <p className="status__detail">{status.meeting.title}</p>
          </>
        )}
        {status.kind === 'free' && (
          <>
            <p className="mono status__label">
              <em className="badge badge--free">Free</em>
              {status.next ? `Until ${formatMinutes(toMinutes(status.next.start))}` : 'For the rest of the day'}
            </p>
            {status.next && <p className="status__detail">Next up: {meetingLabel(status.next)}</p>}
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
          <span className="mono">
            {String(meetings.length).padStart(2, '0')} {meetings.length === 1 ? 'booking' : 'bookings'}
          </span>
        </div>
        <button className="icon-btn" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </nav>
      {!isViewedDay && (
        <button className="link daynav__back" onClick={() => setDate(moment.date)}>
          Back to {formatDate(moment.date, true)} ↑
        </button>
      )}

      <div className="timeline-scroll" ref={scrollRef}>
        {meetings.length === 0 ? (
          <p className="mono empty">Nothing booked in this room on {formatDate(date, true)}.</p>
        ) : (
          <ol className="timeline" style={{ height: y(end) + 16 }}>
            {hours.map((h) => (
              <li key={h} className="timeline__hour" style={{ top: y(h) }} aria-hidden="true">
                <span className="mono">{formatMinutes(h).replace(':00', '')}</span>
              </li>
            ))}
            {layoutLanes(meetings).map(({ m, lane, lanes }) => {
              const s = toMinutes(m.start);
              const e = toMinutes(m.end);
              const now = isViewedDay && s <= moment.minutes && moment.minutes < e;
              const past = isViewedDay && e <= moment.minutes;
              return (
                <li
                  key={`${m.code}-${m.sec}-${m.start}-${m.end}`}
                  className={`block${isEvent(m) ? ' block--event' : ''}${now ? ' block--now' : ''}${past ? ' block--past' : ''}`}
                  style={{
                    top: y(s),
                    height: Math.max(28, (e - s) * PX_PER_MIN - 3),
                    left: `calc(60px + (100% - 60px) * ${lane / lanes})`,
                    width: `calc((100% - 60px) / ${lanes} - ${lanes > 1 ? 4 : 0}px)`,
                  }}
                >
                  <div className="block__row">
                    <strong>
                      {m.code}
                      {!isEvent(m) && <span>.{m.sec}</span>}
                    </strong>
                    <time className="mono">{formatRange(m.start, m.end)}</time>
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
                <span className="mono">{formatMinutes(moment.minutes, false)}</span>
              </li>
            )}
          </ol>
        )}
      </div>
    </aside>
  );
}
