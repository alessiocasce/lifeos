import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { exerciseGroups, curatedAliases } from '../src/data/exerciseCatalogSource.js';
const comparable = new Set(['barbell_flat_bench_press','barbell_incline_bench_press','barbell_back_squat','barbell_front_squat','barbell_deadlift','barbell_sumo_deadlift','barbell_overhead_press','barbell_romanian_deadlift','dumbbell_flat_bench_press','dumbbell_incline_bench_press']);
export const catalog = Object.entries(exerciseGroups).flatMap(([muscle, rows]) => rows.trim().split('\n').map(line => {
  const [slug,name_en,name_it,equipment] = line.split('|');
  if (!name_it || !equipment) throw new Error(`Invalid catalog row: ${slug}`);
  const hash = createHash('md5').update(`lifeos:exercise:v1:${slug}`).digest('hex');
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20)}`;
  const load_type = equipment === 'rope' ? 'none' : equipment === 'bodyweight' ? 'bodyweight' : equipment === 'assisted_machine' ? 'assistance'
    : ['machine','smith','cable'].includes(equipment) ? 'machine_display' : ['dumbbell','kettlebell'].includes(equipment) ? 'per_implement' : 'total_external';
  return { id,slug,name_en,name_it,category: muscle,primary_muscle_group: muscle,equipment,load_type,
    uses_external_load: !['bodyweight','rope'].includes(equipment),is_unilateral: /one_arm|single_leg|alternating|bulgarian|lunge|step_up|concentration|bayesian|kickback|cable_hip_/.test(slug),
    leaderboard_eligible: comparable.has(slug),active:true,aliases:curatedAliases[slug] || [] };
}));
assertCatalog();
function assertCatalog() {
  if(catalog.length<200 || catalog.length>300 || new Set(catalog.map(e=>e.id)).size!==catalog.length || new Set(catalog.map(e=>e.slug)).size!==catalog.length) throw new Error('Catalog identity/count failure');
}
const json = JSON.stringify(catalog,null,2)+'\n';
if(process.argv.includes('--check')) {
  if(fs.readFileSync('src/data/exerciseCatalog.json','utf8').replaceAll('\r\n','\n')!==json) throw new Error('Regenerate catalog');
} else fs.writeFileSync('src/data/exerciseCatalog.json',json);
console.log(`Catalog: ${catalog.length} curated exercises`);
