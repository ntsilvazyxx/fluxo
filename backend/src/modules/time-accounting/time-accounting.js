import { DateTime } from 'luxon';

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const localDateKey = (value) => DateTime.fromJSDate(value, { zone: 'utc' }).toISODate();
const intervalOverlap = (startA, endA, startB, endB) => Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));

function periodsForDate(version, localDay) {
  const key = localDay.toISODate();
  const exceptions = version.exceptions.filter((item) => localDateKey(item.localDate) === key);
  if (exceptions.some((item) => item.type === 'HOLIDAY')) return [];
  const exceptional = exceptions.filter((item) => item.type === 'WORKING_PERIOD');
  if (exceptional.length) return exceptional;
  return version.schedules.filter((item) => item.weekday === localDay.weekday);
}

export function calculateWorkingMilliseconds({ startAt, endAt, calendarVersion, pauses = [] }) {
  if (!startAt || !endAt || endAt <= startAt) return 0;
  const zone = calendarVersion.calendar?.timezone ?? calendarVersion.timezone;
  if (!zone || !DateTime.local().setZone(zone).isValid) throw new Error('Timezone IANA inválido no calendário.');
  const startMs = startAt.getTime(), endMs = endAt.getTime();
  let day = DateTime.fromJSDate(startAt, { zone }).startOf('day');
  const lastDay = DateTime.fromJSDate(endAt, { zone }).startOf('day');
  let total = 0;
  while (day <= lastDay) {
    for (const period of periodsForDate(calendarVersion, day)) {
      const periodStart = day.plus({ minutes: period.startMinute }).toUTC().toMillis();
      const periodEnd = day.plus({ minutes: period.endMinute }).toUTC().toMillis();
      const effectiveStart = Math.max(startMs, periodStart), effectiveEnd = Math.min(endMs, periodEnd);
      if (effectiveEnd <= effectiveStart) continue;
      let worked = effectiveEnd - effectiveStart;
      for (const pause of pauses) {
        const pauseStart = clamp(new Date(pause.startedAt).getTime(), effectiveStart, effectiveEnd);
        const pauseEnd = clamp(new Date(pause.endedAt ?? endAt).getTime(), effectiveStart, effectiveEnd);
        worked -= intervalOverlap(effectiveStart, effectiveEnd, pauseStart, pauseEnd);
      }
      total += Math.max(0, worked);
    }
    day = day.plus({ days: 1 });
  }
  return total;
}

function timestamp(value, field) {
  if (!(value instanceof Date) && !['string', 'number'].includes(typeof value)) throw new TypeError(`Data inválida: ${field}.`);
  const date = value instanceof Date ? value : new Date(value);
  if (value == null || !Number.isFinite(date.getTime())) throw new TypeError(`Data inválida: ${field}.`);
  return date.getTime();
}

function runningClockMetrics(assignment, now) {
  const assignedAt = timestamp(assignment.assignedAt, 'assignedAt');
  const end = timestamp(assignment.endedAt ?? now, 'endedAt/now');
  const acceptedAt = assignment.acceptedAt == null ? null : timestamp(assignment.acceptedAt, 'acceptedAt');
  const waitingMilliseconds = Math.max(0, (acceptedAt ?? end) - assignedAt);
  if (acceptedAt === null) return { waitingMilliseconds, responsibilityMilliseconds: 0, pausedMilliseconds: 0, effectiveWorkingMilliseconds: 0 };

  const responsibilityMilliseconds = Math.max(0, end - acceptedAt);
  // Intersect the union of pauses with this assignment's responsibility window.
  // An open pause ends at the observation/assignment end, never at a deadline.
  const intervals = (assignment.pauseIntervals ?? []).map((pause) => {
    const start = timestamp(pause.startedAt, 'pause.startedAt');
    const finish = pause.endedAt == null ? end : timestamp(pause.endedAt, 'pause.endedAt');
    if (pause.endedAt != null && finish < start) throw new TypeError('Intervalo de pausa inválido.');
    return [Math.max(acceptedAt, start), Math.min(end, finish)];
  }).filter(([start, finish]) => finish > start).sort((a, b) => a[0] - b[0]);
  let pausedMilliseconds = 0;
  let previousEnd = acceptedAt;
  for (const [start, finish] of intervals) {
    pausedMilliseconds += Math.max(0, finish - Math.max(start, previousEnd));
    previousEnd = Math.max(previousEnd, finish);
  }
  return { waitingMilliseconds, responsibilityMilliseconds, pausedMilliseconds, effectiveWorkingMilliseconds: responsibilityMilliseconds - pausedMilliseconds };
}

export function calculateAssignmentMetrics(assignment, now = new Date(), { deadlinePolicy = 'LEGACY_CALENDAR' } = {}) {
  if (deadlinePolicy === 'RUNNING_CLOCK') return runningClockMetrics(assignment, now);
  if (deadlinePolicy !== 'LEGACY_CALENDAR') throw new TypeError('Política de prazo inválida.');
  const assignmentEnd = assignment.endedAt ?? now;
  const waitingEnd = assignment.acceptedAt ?? assignmentEnd;
  const waitingMilliseconds = Math.max(0, waitingEnd - assignment.assignedAt);
  if (!assignment.acceptedAt) return { waitingMilliseconds, responsibilityMilliseconds: 0, pausedMilliseconds: 0, effectiveWorkingMilliseconds: 0 };
  const pauses = assignment.pauseIntervals ?? [];
  const responsibilityMilliseconds = Math.max(0, assignmentEnd - assignment.acceptedAt);
  const pausedMilliseconds = pauses.reduce((total, pause) => total + intervalOverlap(assignment.acceptedAt.getTime(), assignmentEnd.getTime(), pause.startedAt.getTime(), (pause.endedAt ?? now).getTime()), 0);
  return {
    waitingMilliseconds,
    responsibilityMilliseconds,
    pausedMilliseconds,
    effectiveWorkingMilliseconds: calculateWorkingMilliseconds({ startAt: assignment.acceptedAt, endAt: assignmentEnd, calendarVersion: assignment.calendarVersion, pauses }),
  };
}
