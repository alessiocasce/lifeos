import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { exerciseCatalog, normalizeExerciseText } from '../src/utils/exerciseCatalog.js';

// Input is a read-only aggregated inventory, never raw sets, users, loads or notes.
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/audit-legacy-exercise-mapping.js <inventory.json>');
const inventory = JSON.parse(fs.readFileSync(input, 'utf8'));
const baseline = JSON.parse(execFileSync('git', ['show', '13af6c2:src/data/exerciseCatalog.json'], { encoding: 'utf8' }));
if (baseline.length !== exerciseCatalog.length || baseline.some(old => !exerciseCatalog.some(e => e.slug === old.slug && e.id === old.id))) {
  throw new Error('Existing canonical identities changed; stop rollout.');
}
function index(catalog) {
  const aliases = new Map();
  for (const e of catalog) for (const label of [e.name_en, e.name_it, ...e.aliases]) {
    const key = normalizeExerciseText(label);
    if (!aliases.has(key)) aliases.set(key, new Set());
    aliases.get(key).add(e.id);
  }
  return aliases;
}
const previous = index(baseline), current = index(exerciseCatalog);
const review = {
  'Incline Bench Press': ['Incline Barbell Bench Press / Incline Dumbbell Press / Smith Incline Bench Press', 'ambiguous: equipment not specified'],
  'Triceps Pulldown': ['Rope / Straight-Bar / V-Bar Triceps Pushdown', 'ambiguous: attachment and arm count not specified'],
  'Incline Row': ['Chest-Supported Dumbbell Row / Chest-Supported Machine Row', 'ambiguous: equipment and support not specified'],
  'Triceps Overhead': ['Dumbbell / Cable / EZ-Bar Overhead Triceps Extension', 'ambiguous: equipment not specified'],
  'Pectoral Machine': ['Pec Deck Fly / Chest Press Machine', 'ambiguous: fly versus press'],
  'Leg Press': ['45-Degree / Horizontal / Single-Leg Press', 'ambiguous: machine angle and laterality'],
  'Pulley': ['Seated / Wide-Grip / One-Arm Cable Row', 'ambiguous: grip and laterality'],
  'Incline Cable Flies': ['Incline bench cable fly (not in catalog)', 'unsupported: do not substitute flat cable or incline dumbbell fly'],
  'Leg Curl': ['Seated / Lying / Standing Leg Curl', 'ambiguous: position and laterality'],
  'Cable Flies': ['Standing / Flat Bench / High-to-Low / Low-to-High Cable Fly', 'ambiguous: setup and direction'],
  'Romanian Deadlifts': ['Barbell / Dumbbell / Smith Romanian Deadlift', 'ambiguous: equipment not specified'],
  'Single Pushdown': ['One-Arm Cable Pushdown', 'ambiguous: likely cable, but apparatus is not explicit'],
  'Single Tricep Overhead': ['One-Arm Cable / Dumbbell Overhead Triceps Extension', 'ambiguous: equipment not specified'],
  'Pushdown tricipiti': ['Rope / Straight-Bar / V-Bar Triceps Pushdown', 'ambiguous: attachment not specified'],
  'Panca Piana': ['Barbell / Dumbbell / Smith Bench Press', 'ambiguous: equipment not specified'],
  'Panca Inclinata': ['Incline Barbell / Dumbbell / Smith Bench Press', 'ambiguous: equipment not specified'],
  'Lat Machine': ['Lat / Wide-Grip / Close Neutral-Grip / Underhand Pulldown', 'ambiguous: grip not specified'],
  'Row Machine': ['Chest-Supported / High / Low Machine Row', 'ambiguous: machine mechanics'],
  'Multipower Incline': ['Smith Incline Bench Press', 'ambiguous: press inferred, movement not stated'],
  'Overhead tricipiti': ['Dumbbell / Cable / EZ-Bar Overhead Triceps Extension', 'ambiguous: equipment not specified'],
  'Boxing Bag': ['Boxing bag training (not in catalog)', 'unsupported'],
  'Romanian Deadlifts Machine': ['Machine Romanian deadlift (not in catalog) / Smith Romanian Deadlift', 'ambiguous: machine versus Smith'],
  'T Bar': ['T-Bar Row / Chest-Supported T-Bar Row', 'ambiguous: support and loading convention'],
  'Pulley Grip Lat Machine': ['Lat Pulldown / Seated Cable Row variants', 'ambiguous: grip and movement'],
  'Macchinario pettorali': ['Pec Deck Fly / Chest Press Machine', 'ambiguous: fly versus press'],
  'Rear Delt Cable': ['Cable Reverse Fly / Cable Face Pull', 'ambiguous: movement and laterality'],
  'Dumbbell Split Squat': ['Dumbbell split squat (not in catalog)', 'unsupported: not necessarily Bulgarian'],
};
const grouped = new Map();
const totals = () => Object.fromEntries(['sets', 'templates', 'snapshot'].map(s => [s, { mapped: 0, unmatched: 0, ambiguous: 0, total: 0 }]));
const before = totals(), after = totals();
for (const row of inventory) {
  if (!Object.hasOwn(before, row.source) || !Number.isInteger(row.n) || row.n < 0) throw new Error('Invalid inventory');
  const key = normalizeExerciseText(row.exercise);
  const prior = previous.get(key)?.size || 0, next = current.get(key)?.size || 0;
  const status = count => count === 1 ? 'mapped' : count > 1 ? 'ambiguous' : 'unmatched';
  for (const [summary, count] of [[before, prior], [after, next]]) {
    summary[row.source][status(count)] += row.n;
    summary[row.source].total += row.n;
  }
  if (!grouped.has(row.exercise)) {
    const e = next === 1 ? exerciseCatalog.find(e => e.id === [...current.get(key)][0]) : null;
    grouped.set(row.exercise, { name: row.exercise, sets: 0, templates: 0, snapshot: 0,
      status: status(next), possible_canonical: e?.name_en || review[row.exercise]?.[0] || 'Multiple existing alias matches',
      decision: e ? 'safe: exact curated alias' : review[row.exercise]?.[1] || 'ambiguous: existing multiple alias matches' });
  }
  grouped.get(row.exercise)[row.source] += row.n;
}
const names = [...grouped.values()].sort((a, b) => (b.sets+b.templates+b.snapshot)-(a.sets+a.templates+a.snapshot));
const report = { baseline: '13af6c2', canonical_ids_unchanged: true, catalog_count: exerciseCatalog.length, before, after,
  distinct: Object.fromEntries(['mapped', 'unmatched', 'ambiguous'].map(s => [s, names.filter(n => n.status === s).length])), names };
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/final-exercise-mapping-audit.json', JSON.stringify(report, null, 2)+'\n');
fs.writeFileSync('test-results/final-exercise-mapping-audit.md', '# Legacy Exercise Mapping Audit\n\nRead-only production inventory. No inferred equipment assignments.\n\n'+
  '| Original name | Sets | Templates | Snapshots | Match | Possible canonical | Decision |\n|---|---:|---:|---:|---|---|---|\n'+
  names.map(n => `| ${n.name} | ${n.sets} | ${n.templates} | ${n.snapshot} | ${n.status} | ${n.possible_canonical} | ${n.decision} |`).join('\n')+'\n');
console.log(JSON.stringify({ before, after, distinct: report.distinct, canonical_ids_unchanged: true }, null, 2));
