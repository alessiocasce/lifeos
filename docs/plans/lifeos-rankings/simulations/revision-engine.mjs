// Planning revision: receipt arithmetic is modeled, not a production trust boundary.
import { clamp, ratedDays, tierAt, TIERS } from './engine.mjs';
export const mechanisms = {
  original: { flat: 14, end: 28, target: 9 },
  balanced: { flat: 21, end: 42, target: 13.5 },
  longGrace: { flat: 28, end: 42, target: 15 },
};
export const weightAt = (age, policy = 'balanced') => {
  const { flat, end } = mechanisms[policy];
  return age < 0 || age >= end ? 0 : age <= flat ? 1 : (end - age) / (end - flat);
};
export function activity(workouts, asOf, { competitive = false, minimum = 2, receiptPolicy = 'same-day', sinceDay = -Infinity } = {}) {
  const latest = new Map();
  for (const workout of workouts) {
    if (workout.receivedDay > asOf) continue;
    if (!latest.has(workout.id) || (workout.revision || 0) >= (latest.get(workout.id).revision || 0)) latest.set(workout.id, workout);
  }
  const dates = new Map(), seen = new Set();
  for (const w of latest.values()) {
    if (!w.completed || w.deleted || !Number.isInteger(w.day)) continue;
    // firstReceivedDay represents immutable server-owned state in the experiment.
    const receipt = w.firstReceivedDay ?? w.receivedDay;
    const originalDay = w.initialDay ?? w.day;
    if (!Number.isInteger(receipt)) continue;
    if (competitive && (originalDay > receipt || receipt < sinceDay)) continue;
    if (competitive && (w.rankEligible === false || (receiptPolicy === 'same-day' ? originalDay !== receipt : receipt - originalDay > 3))) continue;
    const day = competitive ? (receiptPolicy === 'same-day' ? receipt : originalDay) : w.day;
    if (day > asOf) continue;
    const bucket = dates.get(day) || new Map();
    for (const s of w.sets || []) {
      if (competitive && (s.firstReceivedDay ?? receipt) !== receipt) continue;
      if (competitive && s.initialEligible === false) continue;
      if (seen.has(s.id) || s.deleted || s.warmup || !Number.isInteger(s.reps) || s.reps < 1 || s.reps > 50 || !Number.isFinite(s.weight) || s.weight < 0) continue;
      seen.add(s.id);
      const key = s.exerciseId || 'custom:' + String(s.exercise).trim().toLowerCase().replace(/\s+/g, ' ');
      bucket.set(key, (bucket.get(key) || 0) + 1);
    }
    dates.set(day, bucket);
  }
  return [...dates].map(([day, sets]) => ({ day, n: Math.min(8, [...sets.values()].reduce((sum, n) => sum + Math.min(4, n), 0)) }))
    .filter(d => d.n >= minimum).sort((a, b) => a.day - b.day);
}
export function xp(workouts, asOf, options = {}) {
  const days = ratedDays(activity(workouts, asOf, options)), weeks = new Map();
  for (const d of days) {
    const week = Math.floor((d.day + 1) / 7);
    weeks.set(week, [...(weeks.get(week) || []), d]);
  }
  return [...weeks.values()].reduce((sum, rows) => sum + rows.reduce((s, d) => s + (options.legacyAwards ? 40 + 5 * d.n : 10 * d.n), 0) + [0, 0, 10, 30, 40][rows.length], 0);
}
export function snapshot(workouts, events, asOf, { policy = 'balanced', minimum = 2, receiptPolicy = 'same-day', partial = true, sinceDay = -Infinity } = {}) {
  const days = ratedDays(activity(workouts, asOf, { competitive: true, minimum, receiptPolicy, sinceDay }));
  const k = age => weightAt(age, policy), target = mechanisms[policy].target;
  const c = clamp(days.reduce((s, d) => s + k(asOf - d.day) * (partial ? Math.min(1, d.n / 4) : 1), 0) / target);
  const w = clamp(days.reduce((s, d) => s + k(asOf - d.day) * d.n / 8, 0) / target);
  const best = new Map();
  for (const event of events) {
    if (!days.some(d => d.day === event.day)) continue;
    best.set(event.exerciseId, Math.max(best.get(event.exerciseId) || 0, k(asOf - event.day)));
  }
  const p = clamp([...best.values()].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) / 2);
  const points = [450 * c, 400 * w, 150 * p];
  const rp = Math.round(points.reduce((a, b) => a + b, 0));
  return { rp, tier: tierAt(rp), c, w, p, points, breakdown: points.map(Math.round), window: mechanisms[policy].end, days };
}
export function league(s, asOf, previous = { tier: 'Unranked', below: 0 }, { apexEnabled = false } = {}) {
  const recent = [...new Map(s.days.filter(d => d.day <= asOf && asOf - d.day < s.window && d.n >= 2).map(d => [d.day,d])).values()].sort((a,b)=>a.day-b.day);
  const placed = recent.length >= 4 && recent.at(-1).day - recent[0].day >= 14;
  if (!s.rp || !placed) return { tier: 'Unranked', below: 0, asOf };
  const apex = apexEnabled && recent.length >= 10 && recent.at(-1).day - recent[0].day >= 21;
  const raw = tierAt(s.rp);
  const target = raw === 'Apex' && !apex ? 'Diamond' : raw;
  // Hard eligibility is applied BEFORE score hysteresis. It cannot be retained.
  const priorTier = previous.tier === 'Apex' && !apex ? 'Diamond' : previous.tier;
  const current = TIERS.findIndex(([name]) => name === priorTier);
  const next = TIERS.findIndex(([name]) => name === target);
  if (current > next) {
    const breached = s.rp < TIERS[current][1] - 20;
    const sameDay = previous.asOf === asOf;
    const consecutive = previous.asOf === asOf - 1;
    const priorBelow = priorTier === previous.tier ? previous.below : 0;
    const below = !breached ? 0 : sameDay ? priorBelow : consecutive ? priorBelow + 1 : 1;
    if (below < 2) return { tier: priorTier, below, asOf };
  }
  return { tier: target, below: 0, asOf };
}
export function consistencyKey(days, asOf) {
  // Eight complete ISO weeks only. Work beyond three dates/week cannot improve ordering.
  const currentWeek = Math.floor((asOf + 1) / 7), weeks = [];
  for (let week = currentWeek - 8; week < currentWeek; week++) {
    const count = days.filter(d => d.n >= 4 && Math.floor((d.day + 1) / 7) === week).length;
    weeks.push(Math.min(3, count));
  }
  return [weeks.filter(n => n >= 2).length, weeks.reduce((s, n) => s + n, 0)];
}
