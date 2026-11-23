// Training filter for the Companion `get_training_summary` reader.
//
// The user asks by muscle group in Italian ("gambe", "petto") while sets are
// logged by exercise name, often in English ("Leg Extension", "Bench Press").
// A filter therefore matches the session's own name ("gambe", "lower 1") or
// the exercises that belong to the group. Shared by the real reader and the
// eval mock world so they cannot drift apart.

const GROUPS = Object.freeze({
  legs: {
    aliases: ['gambe', 'gamba', 'legs', 'leg', 'lower', 'quadricipiti', 'quad', 'quads', 'femorali', 'hamstring', 'hamstrings', 'glutei', 'glutes', 'polpacci', 'calves'],
    keywords: ['leg', 'squat', 'lunge', 'affond', 'deadlift', 'stacco', 'hip thrust', 'calf', 'adductor', 'abductor', 'glute', 'hack', 'quad', 'hamstring', 'polpacci', 'pressa', 'bulgarian', 'step up'],
  },
  chest: {
    aliases: ['petto', 'chest', 'pettorali', 'pecs'],
    keywords: ['bench', 'chest', 'pectoral', 'panca', 'incline dumbbell press', 'incline press', 'fly', 'flies', 'croci', 'push up', 'piegamenti', 'dip'],
    // "Chest-Supported Row" and "Incline Pistol Pulley" are back exercises.
    exclude: ['chest supported', 'row', 'pulley'],
  },
  back: {
    aliases: ['schiena', 'dorso', 'back', 'dorsali', 'lats'],
    keywords: ['row', 'rematore', 'pull up', 'pullup', 'chin up', 'trazioni', 'lat machine', 'pulldown', 'pulley', 'back extension', 'shrug', 'schrug', 'deadlift', 'stacco'],
  },
  shoulders: {
    aliases: ['spalle', 'spalla', 'shoulders', 'shoulder', 'delts', 'deltoidi'],
    keywords: ['shoulder', 'lateral', 'military', 'overhead press', 'alzate', 'arnold', 'face pull', 'rear delt'],
  },
  biceps: {
    aliases: ['bicipiti', 'bicipite', 'biceps', 'bic', 'bicep'],
    keywords: ['curl'],
    exclude: ['leg curl'],
  },
  triceps: {
    aliases: ['tricipiti', 'tricipite', 'triceps', 'tri', 'tricep'],
    keywords: ['tricep', 'pushdown', 'skull', 'french press', 'dip'],
  },
  core: {
    aliases: ['addome', 'addominali', 'abs', 'core'],
    keywords: ['crunch', 'plank', 'russian twist', 'leg raise', 'sit up'],
  },
});

const COMPOSITES = Object.freeze({ braccia: ['biceps', 'triceps'], arms: ['biceps', 'triceps'], upper: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] });

export function normalizeTrainingText(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Returns null for an empty query (no filter).
export function createTrainingMatcher(query) {
  const words = normalizeTrainingText(query).split(' ').filter(Boolean);
  if (!words.length) return null;
  const groups = new Set();
  for (const word of words) {
    for (const [name, group] of Object.entries(GROUPS)) if (group.aliases.includes(word)) groups.add(name);
    for (const name of COMPOSITES[word] ?? []) groups.add(name);
  }
  const plainWords = words.filter((word) => word.length > 2 && !isAlias(word));
  const nameAliases = [...groups].flatMap((name) => GROUPS[name].aliases);

  return {
    groups: [...groups],
    matchesSessionName(name) {
      const sessionWords = normalizeTrainingText(name).split(' ');
      return sessionWords.some((word) => nameAliases.includes(word) || Object.entries(COMPOSITES).some(([alias, members]) => alias === word && members.some((member) => groups.has(member))));
    },
    matchesExercise(name) {
      const haystack = ` ${normalizeTrainingText(name)} `;
      if (plainWords.some((word) => haystack.includes(word.slice(0, 5)))) return true;
      return [...groups].some((groupName) => {
        const group = GROUPS[groupName];
        if (group.exclude?.some((phrase) => haystack.includes(phrase))) return false;
        return group.keywords.some((keyword) => haystack.includes(keyword));
      });
    },
  };
}

// session: { name, exercises: [{ name, ... }] } -> filtered session or null.
// A session named for the group ("gambe", "lower 2") counts even when its
// logged exercises do not all match; then only the matching ones are shown,
// or all of them if none match.
export function filterTrainingSession(session, matcher) {
  if (!matcher) return session.exercises.length ? session : null;
  const exercises = session.exercises.filter((exercise) => matcher.matchesExercise(exercise.name));
  if (matcher.matchesSessionName(session.name)) {
    return { ...session, exercises: exercises.length ? exercises : session.exercises, matched_by: 'session_name' };
  }
  return exercises.length ? { ...session, exercises, matched_by: 'exercises' } : null;
}

function isAlias(word) {
  return Object.values(GROUPS).some((group) => group.aliases.includes(word)) || Boolean(COMPOSITES[word]);
}
