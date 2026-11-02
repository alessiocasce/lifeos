// Original vector artwork: shared 48px optical grid, rounded 1.8px contours,
// translucent muscle volumes, and currentColor throughout for saved palettes.
const TORSO = 'M18 6c-1 3-4 4-7 5-4 2-5 6-5 10l-1 10c0 2 3 3 4 1l3-9 2 9c1 4 2 7 2 10h16c0-3 1-6 2-10l2-9 3 9c1 2 4 1 4-1l-1-10c0-4-1-8-5-10-3-1-6-2-7-5';
const LEGS = 'M13 5c-2 7-3 12-1 18l3 7-1 10c0 4 5 4 6 1l4-16 4 16c1 3 6 3 6-1l-1-10 3-7c2-6 1-11-1-18';
const ART = {
  chest: { outline: TORSO, volume: 'M13 14c3-3 7-3 10-1v10c-4 2-8 0-10-3Zm22 0c-3-3-7-3-10-1v10c4 2 8 0 10-3Z', detail: 'M24 11v16M16 29c5 2 11 2 16 0' },
  back: { outline: TORSO, volume: 'M12 15c3 0 5-2 7-5l4 6-2 17c-5-3-8-9-9-18Zm24 0c-3 0-5-2-7-5l-4 6 2 17c5-3 8-9 9-18Z', detail: 'M24 10v26M17 13l5 7m9-7-5 7M21 37l3-2 3 2' },
  shoulders: { outline: TORSO, volume: 'M17 10c-7 0-10 4-10 11l6-1c0-5 2-7 6-8Zm14 0c7 0 10 4 10 11l-6-1c0-5-2-7-6-8Z', detail: 'M19 12c3 2 7 2 10 0M17 25c4 3 10 3 14 0M24 17v11' },
  biceps: { outline: 'M12 34c5-2 6-7 7-12l-4-5-4 4-5-7c-1-2 0-4 2-5l4-1 5 4M19 22c5-3 9-3 13-1 5 3 8 8 9 14-8 5-20 6-29-1Z', volume: 'M20 25c3-6 10-6 14 0 2 3 2 7 0 10-6 2-12 1-17-1Z', detail: 'M7 10l4 4M13 32c3-1 5-4 6-8M35 35l5-1' },
  triceps: { outline: 'M20 5c-6 0-10 5-10 11 0 5 4 8 6 12l3 11c1 4 6 5 9 2l7-8c2-2 1-5-1-6l-3 1-5 6-1-11c4-4 4-10 1-15-1-2-3-3-6-3Z', volume: 'M14 16c3-3 8-1 10 3l-1 14c-5-3-8-10-9-17Z', detail: 'M14 12c2-4 7-5 10-1M25 34l3 3M19 39l5 1' },
  quads: { outline: LEGS, volume: 'M14 9c-2 5-2 10 1 15l3 5c4-6 5-13 4-19Zm20 0c2 5 2 10-1 15l-3 5c-4-6-5-13-4-19Z', detail: 'M14 6c6 2 14 2 20 0M24 9v16M16 31l3 1m10 0 3-1' },
  hamstrings: { outline: LEGS, volume: 'M14 15c-1 4 0 10 4 15 3-4 4-9 4-15Zm20 0c1 4 0 10-4 15-3-4-4-9-4-15Z', detail: 'M13 9c2 5 7 6 11 2 4 4 9 3 11-2M24 5v20M17 33l2 1m10 0 2-1' },
  calves: { outline: 'M14 5c0 7 3 10 3 15-4 4-5 10-2 15l1 6h6l1-11 1-9 1 9 1 11h6l1-6c3-5 2-11-2-15 0-5 3-8 3-15', volume: 'M17 22c-4 3-4 9 1 13 3-3 4-8 2-12Zm14 0c4 3 4 9-1 13-3-3-4-8-2-12Z', detail: 'M17 18l3 1m8 0 3-1M16 41l-2 2h8m4 0h8l-2-2' },
  core: { outline: TORSO, volume: 'M18 18c2-1 3-1 5 0v6h-5Zm7 0c2-1 3-1 5 0v6h-5Zm-7 8h5v6l-4-1Zm7 0h5l-1 5-4 1Zm-6 8 4 1v5l-3-2Zm6 1 4-1-1 4-3 2Z', detail: 'M14 25l2 9m18-9-2 9M18 12c4 2 8 2 12 0' },
  full_body: { outline: 'M24 4c3 0 5 2 5 5l-1 4c6 1 9 4 10 9l3 9c1 3-3 4-4 1l-5-10-1 11 3 10h-7l-3-10-3 10h-7l3-10-1-11-5 10c-1 3-5 2-4-1l3-9c1-5 4-8 10-9l-1-4c0-3 2-5 5-5Z', volume: 'M17 18c2-2 4-2 6-1v7l-5-1Zm14 0c-2-2-4-2-6-1v7l5-1ZM18 29l5-2-3 12-3-5Zm12 0-5-2 3 12 3-5Z', detail: 'M24 17v11M20 10c2 2 6 2 8 0' },
  boxing: { outline: 'M14 6c-4 0-7 3-7 7v7c-3 0-5 2-4 5l3 7c1 3 4 5 7 5h8c3 0 5-3 5-6V15c0-5-4-9-9-9Zm13 4c4-3 11-1 13 4l3 8c2 5 0 9-4 11l-8 4', volume: 'M7 18c5-3 12-2 19 2v10c0 3-2 5-5 5h-8c-3 0-6-2-7-5l-2-5c-1-2 0-4 3-4Z', detail: 'M8 38v5h16v-5M32 38l2 5 10-4-2-5M11 12c3-2 7-1 9 1M33 16l5 2' },
  dumbbell: { outline: 'M8 18 18 8l5 5L13 23Zm17 17 10-10 5 5-10 10ZM5 15l4-4m30 26 4-4M17 22l9 9m-4-14 9 9', volume: 'M8 18 18 8l5 5L13 23Zm17 17 10-10 5 5-10 10Z', detail: 'M3 13l4-4m34 30 4-4' },
};

export function TrainingTemplateIcon({ iconKey, size = 28 }) {
  const known = Object.hasOwn(ART, iconKey);
  const art = known ? ART[iconKey] : ART.dumbbell;
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon={known ? iconKey : 'dumbbell'}>
    <path d={art.volume} fill="currentColor" fillOpacity=".2" strokeWidth="1.3" />
    <path d={art.outline} />
    <path d={art.detail} opacity=".85" />
  </svg>;
}
