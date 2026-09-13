import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);
export const CALENDAR_EVENT_STYLES = {
  active: 'border border-green-700 bg-green-50 text-green-900 hover:bg-green-100',
  confirmed: 'border border-blue-700 bg-blue-50 text-blue-900 hover:bg-blue-100',
  overdue: 'border border-red-700 bg-red-50 text-red-900 hover:bg-red-100',
  'pre-booking': 'border border-amber-700 bg-amber-50 text-amber-900 hover:bg-amber-100',
};

/** Legend entries for the calendar view. */
export const CALENDAR_LEGEND = [
  { key: 'active', label: 'Active' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'pre-booking', label: 'Pre-booking' },
];

/**
 * Resolve Tailwind classes for a calendar event chip.
 * @param {{ type: string, status: string }} event
 * @returns {string}
 */
export const getCalendarEventStyle = (event) => {
  if (event?.type === 'pre-booking') return CALENDAR_EVENT_STYLES['pre-booking'];
  return CALENDAR_EVENT_STYLES[event?.status] || CALENDAR_EVENT_STYLES.confirmed;
};

/**
 * Visible date range for month grid (includes leading/trailing days).
 * @param {dayjs.Dayjs} anchor - Any day in the target month
 * @returns {{ start: string, end: string, days: dayjs.Dayjs[] }}
 */
export const getMonthGridRange = (anchor) => {
  const monthStart = anchor.startOf('month');
  const monthEnd = anchor.endOf('month');
  const gridStart = monthStart.startOf('isoWeek');
  const gridEnd = monthEnd.endOf('isoWeek');

  const days = [];
  let cursor = gridStart;
  while (cursor.isBefore(gridEnd) || cursor.isSame(gridEnd, 'day')) {
    days.push(cursor);
    cursor = cursor.add(1, 'day');
  }

  return {
    start: gridStart.format('YYYY-MM-DD'),
    end: gridEnd.format('YYYY-MM-DD'),
    days,
  };
};

/**
 * Visible date range for week view (ISO week, Monday start).
 * @param {dayjs.Dayjs} anchor
 * @returns {{ start: string, end: string, days: dayjs.Dayjs[] }}
 */
export const getWeekRange = (anchor) => {
  const weekStart = anchor.startOf('isoWeek');
  const weekEnd = anchor.endOf('isoWeek');
  const days = Array.from({ length: 7 }, (_, index) => weekStart.add(index, 'day'));

  return {
    start: weekStart.format('YYYY-MM-DD'),
    end: weekEnd.format('YYYY-MM-DD'),
    days,
  };
};

/**
 * Whether an event overlaps a calendar day (inclusive).
 * @param {{ startDate: string, endDate: string }} event
 * @param {dayjs.Dayjs} day
 * @returns {boolean}
 */
export const eventOverlapsDay = (event, day) => {
  if (!event?.startDate || !event?.endDate) return false;
  const dayStart = day.startOf('day');
  const eventStart = dayjs(event.startDate).startOf('day');
  const eventEnd = dayjs(event.endDate).startOf('day');
  return !dayStart.isBefore(eventStart, 'day') && !dayStart.isAfter(eventEnd, 'day');
};

/**
 * Group calendar events by YYYY-MM-DD for fast day lookup.
 * @param {Array} events
 * @returns {Map<string, Array>}
 */
export const groupEventsByDay = (events = []) => {
  const map = new Map();

  events.forEach((event) => {
    if (!event?.startDate || !event?.endDate) return;
    let cursor = dayjs(event.startDate).startOf('day');
    const last = dayjs(event.endDate).startOf('day');

    while (!cursor.isAfter(last, 'day')) {
      const key = cursor.format('YYYY-MM-DD');
      const bucket = map.get(key) || [];
      bucket.push(event);
      map.set(key, bucket);
      cursor = cursor.add(1, 'day');
    }
  });

  return map;
};

/** Short weekday labels for calendar headers. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
