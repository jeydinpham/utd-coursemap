import type { CampusMoment } from '../types';

export const CAMPUS_TZ = 'America/Chicago';

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The current time at UT Dallas, regardless of the viewer's timezone. */
export function campusNow(now = new Date()): CampusMoment {
  const p = Object.fromEntries(parts.formatToParts(now).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, weekday: weekdayOf(date), minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 615 -> "10:15 AM" */
export function formatMinutes(mins: number, withPeriod = true): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${withPeriod ? (h < 12 ? ' AM' : ' PM') : ''}`;
}

/** "10:00"–"11:15" -> "10:00 – 11:15 AM", collapsing the period when shared. */
export function formatRange(start: string, end: string): string {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const samePeriod = s < 720 === e < 720;
  return `${formatMinutes(s, !samePeriod)} – ${formatMinutes(e)}`;
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const formatDate = (isoDate: string, short = false) =>
  (short ? shortDate : longDate).format(new Date(isoDate + 'T12:00:00Z'));
