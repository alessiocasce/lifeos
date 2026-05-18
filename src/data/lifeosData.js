export const tabs = [
  { id: 'home', label: 'Pulse' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'memos', label: 'Memos' },
  { id: 'health', label: 'Health' },
  { id: 'workout', label: 'Workout' },
  { id: 'finances', label: 'Ledger' },
  { id: 'assistant', label: 'Brain' },
];

export const currentDate = '2026-05-11';
export const mockNowMinutes = 13 * 60 + 42;

export const agendaBlocks = [
  { start: '06:15', end: '06:45', title: 'Mobility + hydration', type: 'health', priority: 'medium', tags: ['#recovery'] },
  { start: '07:00', end: '08:15', title: 'Linear algebra review', type: 'academic', priority: 'high', tags: ['#academic'] },
  { start: '08:30', end: '10:45', title: 'Deep Work: LifeOS sprint', type: 'deep-work', priority: 'high', tags: ['#deep-work'] },
  { start: '11:00', end: '11:25', title: 'Admin inbox zero', type: 'admin', priority: 'low', tags: ['#ops'] },
  { start: '12:00', end: '12:40', title: 'Protein lunch + walk', type: 'health', priority: 'medium', tags: ['#nutrition'] },
  { start: '13:00', end: '14:30', title: 'Research methods lecture', type: 'academic', priority: 'high', tags: ['#academic'] },
  { start: '15:00', end: '16:10', title: 'Push Day strength block', type: 'workout', priority: 'high', tags: ['#training'] },
  { start: '17:00', end: '18:30', title: 'Finance reconciliation', type: 'finance', priority: 'medium', tags: ['#ledger'] },
  { start: '20:30', end: '21:00', title: 'Nightly performance review', type: 'review', priority: 'high', tags: ['#ai-review'] },
];

export const calendarWeeks = [
  [
    { day: 27, muted: true, events: [] },
    { day: 28, muted: true, events: [{ title: 'Rent buffer check', priority: 'medium', tags: ['#finance'] }] },
    { day: 29, muted: true, events: [] },
    { day: 30, muted: true, events: [{ title: 'Lab prep', priority: 'high', tags: ['#academic'] }] },
    { day: 1, muted: false, events: [{ title: 'Program reset', priority: 'high', tags: ['#training'] }] },
    { day: 2, muted: false, events: [{ title: 'Meal prep', priority: 'medium', tags: ['#health'] }] },
    { day: 3, muted: false, events: [] },
  ],
  [
    { day: 4, muted: false, events: [{ title: 'Exam sprint', priority: 'high', tags: ['#academic'] }] },
    { day: 5, muted: false, events: [{ title: 'Pull Day', priority: 'high', tags: ['#training'] }] },
    { day: 6, muted: false, events: [{ title: 'AI triage review', priority: 'medium', tags: ['#ops'] }] },
    { day: 7, muted: false, events: [{ title: 'Budget variance', priority: 'medium', tags: ['#finance'] }] },
    { day: 8, muted: false, events: [{ title: 'Zone 2 run', priority: 'medium', tags: ['#recovery'] }] },
    { day: 9, muted: false, events: [] },
    { day: 10, muted: false, events: [{ title: 'Weekly reset', priority: 'high', tags: ['#review'] }] },
  ],
  [
    { day: 11, muted: false, selected: true, events: [{ title: 'LifeOS sprint', priority: 'high', tags: ['#deep-work'] }, { title: 'Push Day', priority: 'high', tags: ['#training'] }] },
    { day: 12, muted: false, events: [{ title: 'Stats problem set', priority: 'high', tags: ['#academic'] }] },
    { day: 13, muted: false, events: [{ title: 'Dentist', priority: 'medium', tags: ['#health'] }, { title: 'Pull Day', priority: 'high', tags: ['#training'] }] },
    { day: 14, muted: false, events: [{ title: 'Thesis outline', priority: 'high', tags: ['#academic'] }] },
    { day: 15, muted: false, events: [{ title: 'Subscription audit', priority: 'low', tags: ['#finance'] }] },
    { day: 16, muted: false, events: [{ title: 'Long walk', priority: 'medium', tags: ['#recovery'] }] },
    { day: 17, muted: false, events: [{ title: 'Weekly review', priority: 'high', tags: ['#review'] }] },
  ],
  [
    { day: 18, muted: false, events: [{ title: 'Product mock critique', priority: 'medium', tags: ['#deep-work'] }] },
    { day: 19, muted: false, events: [{ title: 'Leg Day', priority: 'high', tags: ['#training'] }] },
    { day: 20, muted: false, events: [{ title: 'Office hours', priority: 'medium', tags: ['#academic'] }] },
    { day: 21, muted: false, events: [{ title: 'Tax docs', priority: 'medium', tags: ['#finance'] }] },
    { day: 22, muted: false, events: [{ title: 'Deload planning', priority: 'low', tags: ['#training'] }] },
    { day: 23, muted: false, events: [] },
    { day: 24, muted: false, events: [{ title: 'Weekly reset', priority: 'high', tags: ['#review'] }] },
  ],
  [
    { day: 25, muted: false, events: [{ title: 'Final review sprint', priority: 'high', tags: ['#academic'] }] },
    { day: 26, muted: false, events: [{ title: 'Push Day', priority: 'high', tags: ['#training'] }] },
    { day: 27, muted: false, events: [{ title: 'Grocery restock', priority: 'medium', tags: ['#health'] }] },
    { day: 28, muted: false, events: [{ title: 'Balance transfer', priority: 'medium', tags: ['#finance'] }] },
    { day: 29, muted: false, events: [{ title: 'Project demo', priority: 'high', tags: ['#deep-work'] }] },
    { day: 30, muted: false, events: [{ title: 'Zone 2 run', priority: 'medium', tags: ['#recovery'] }] },
    { day: 31, muted: false, events: [{ title: 'Month close', priority: 'high', tags: ['#ledger'] }] },
  ],
];

export const selectedDayAgenda = [
  { time: '06:15', title: 'Mobility flow', duration: '30m', priority: 'medium', tags: ['#recovery'] },
  { time: '07:00', title: 'Linear algebra: eigenvectors', duration: '75m', priority: 'high', tags: ['#academic'] },
  { time: '08:30', title: 'LifeOS implementation sprint', duration: '135m', priority: 'high', tags: ['#deep-work'] },
  { time: '11:00', title: 'Inbox zero, messages, receipts', duration: '25m', priority: 'low', tags: ['#ops'] },
  { time: '13:00', title: 'Research methods lecture', duration: '90m', priority: 'high', tags: ['#academic'] },
  { time: '15:00', title: 'Push Day strength block', duration: '70m', priority: 'high', tags: ['#training'] },
  { time: '17:00', title: 'Reconcile May spend', duration: '90m', priority: 'medium', tags: ['#finance'] },
  { time: '20:30', title: 'Nightly Performance Review', duration: '30m', priority: 'high', tags: ['#ai-review'] },
];

export const initialHealth = {
  sleepHours: 7.25,
  sleepQuality: 84,
  energy: 7,
  coffee: 2,
  water: 4,
  adc: 0,
  mood: 8,
  hygiene: [
    { id: 'brush', label: 'Brush', count: 2 },
    { id: 'shower', label: 'Shower', count: 1 },
    { id: 'creatine', label: 'Creatine', count: 1 },
    { id: 'skin', label: 'Skin', count: 1 },
    { id: 'journal', label: 'Journal', type: 'boolean', done: false },
  ],
  consistency: [
    0.95, 0.76, 0.88, 0.61, 0.91, 0.82, 1, 0.58, 0.72, 0.84,
    0.93, 0.69, 1, 0.87, 0.43, 0.81, 0.77, 0.9, 0.96, 0.67,
    0.89, 1, 0.79, 0.71, 0.85, 0.92, 0.63, 0.97, 0.74, 0.88,
  ],
};

export const workoutData = {
  restTimerSeconds: 92,
  current: {
    name: 'Incline Dumbbell Press',
    block: 'Push Day A',
    set: 3,
    totalSets: 4,
    target: '8-10 reps @ RPE 8',
    previous: { weight: 32, reps: 9 },
    inputs: { weight: 34, reps: 8, rpe: 8.5 },
  },
  exercises: [
    { name: 'Incline DB Press', trend: [1420, 1480, 1510, 1495, 1580, 1632], status: '+3.3%' },
    { name: 'Weighted Dips', trend: [940, 1010, 980, 1060, 1105, 1120], status: '+1.4%' },
    { name: 'Seated Shoulder Press', trend: [760, 790, 830, 820, 850, 880], status: '+3.5%' },
    { name: 'Cable Fly', trend: [520, 560, 575, 590, 620, 640], status: '+3.2%' },
  ],
  history: [
    {
      date: '2026-05-09',
      title: 'Pull Day B',
      duration: '54m',
      volume: 9820,
      prs: 2,
      exercises: [
        { name: 'Weighted Pull-Up', sets: ['+18kg x 6', '+18kg x 6', '+16kg x 7'] },
        { name: 'Chest-Supported Row', sets: ['72kg x 9', '72kg x 8', '68kg x 10'] },
        { name: 'Bayesian Curl', sets: ['16kg x 12', '16kg x 11', '14kg x 13'] },
      ],
    },
    {
      date: '2026-05-06',
      title: 'Leg Day A',
      duration: '61m',
      volume: 12340,
      prs: 1,
      exercises: [
        { name: 'Back Squat', sets: ['112.5kg x 5', '112.5kg x 5', '105kg x 7'] },
        { name: 'Romanian Deadlift', sets: ['105kg x 8', '105kg x 8', '100kg x 9'] },
        { name: 'Leg Press', sets: ['220kg x 12', '220kg x 11', '210kg x 13'] },
      ],
    },
    {
      date: '2026-05-03',
      title: 'Push Day A',
      duration: '58m',
      volume: 10680,
      prs: 1,
      exercises: [
        { name: 'Incline DB Press', sets: ['32kg x 9', '32kg x 8', '30kg x 10'] },
        { name: 'Weighted Dips', sets: ['+28kg x 7', '+28kg x 6', '+24kg x 9'] },
        { name: 'Cable Fly', sets: ['32kg x 13', '32kg x 12', '30kg x 14'] },
      ],
    },
  ],
};

export const financeData = {
  balance: 18426.72,
  monthlySpend: 2814.4,
  monthlyBudget: 3600,
  categories: ['Food', 'Training', 'Transport', 'Rent', 'Software', 'Books', 'Health'],
  budgetSegments: [
    { name: 'Rent', value: 1200, color: '#06b6d4' },
    { name: 'Food', value: 612, color: '#10b981' },
    { name: 'Training', value: 185, color: '#f59e0b' },
    { name: 'Transport', value: 148, color: '#8b5cf6' },
    { name: 'Software', value: 229, color: '#f43f5e' },
    { name: 'Other', value: 440.4, color: '#71717a' },
  ],
  entries: [
    { id: 1, date: 'May 11', vendor: 'Whole Foods', category: 'Food', amount: -38.42, signal: 'normal' },
    { id: 2, date: 'May 11', vendor: 'University stipend', category: 'Income', amount: 1850, signal: 'good' },
    { id: 3, date: 'May 10', vendor: 'Gym annual reserve', category: 'Training', amount: -45, signal: 'normal' },
    { id: 4, date: 'May 10', vendor: 'Notion AI', category: 'Software', amount: -10, signal: 'watch' },
    { id: 5, date: 'May 09', vendor: 'Bookshop', category: 'Books', amount: -27.9, signal: 'normal' },
  ],
};
