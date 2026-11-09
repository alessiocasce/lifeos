import { addDays } from './date.js';

export function weekDates(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = addDays(date, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function matchesWorkoutFilter(row, filter) {
  return (!filter.from || row.performed_on >= filter.from)
    && (!filter.to || row.performed_on <= filter.to)
    && (filter.templateId === undefined || (filter.templateId === null ? !row.template_id : row.template_id === filter.templateId));
}

// Production filters at the query boundary. The defensive match also supports
// older adapters while scanning their complete keyset pages, never just page 1.
export async function loadFilteredWorkoutPage(page, filter, cursor = null, isCurrent = () => true) {
  const rows = new Map();
  let next = cursor;
  let hasMore = true;
  while (hasMore && rows.size < 25 && isCurrent()) {
    const result = await page(next, 25, filter);
    if (!isCurrent()) return null;
    for (const row of result.rows) if (matchesWorkoutFilter(row, filter)) rows.set(row.id, row);
    hasMore = Boolean(result.hasMore);
    if (hasMore && (!result.cursor || JSON.stringify(result.cursor) === JSON.stringify(next))) throw new Error('Workout history pagination did not advance.');
    next = result.cursor;
  }
  return { rows: [...rows.values()], cursor: next, hasMore };
}
