// Public, synthetic Companion eval cases. Everything here is invented: real
// conversations belong in the private, gitignored set (evals/private/cases.json).
// Default clock: Friday 2026-11-20, 18:30 Europe/Rome (see mockWorld.js).
// Tags `guarantee:*` map to the behaviour guarantees in spec §7.

export const COMPANION_GUARANTEES = Object.freeze([
  'guarantee:negative_no_write',
  'guarantee:context_no_authority',
  'guarantee:sleep_start',
  'guarantee:nap_note',
  'guarantee:vague_time',
  'guarantee:memo_not_calendar',
  'guarantee:destructive_confirm',
  'guarantee:no_debug',
]);

export const PUBLIC_EVAL_CASES = Object.freeze([
  // Commitments
  {
    id: 'commitment-deadline-capture',
    tags: ['job:commitments', 'write'],
    message: 'Devo consegnare la relazione di economia entro giovedì',
    expect: { calls: [{ name: 'upsert_commitment', args: { title: { $includes: 'relazione' }, due_date: '2026-11-26' } }] },
  },
  {
    id: 'segna-domani-is-commitment',
    tags: ['guarantee:memo_not_calendar', 'job:commitments', 'write'],
    message: 'segna parrucchiere domani',
    severity: 'P1',
    expect: {
      calls: [{ name: 'upsert_commitment', args: { title: { $includes: 'parrucchiere' }, due_date: '2026-11-21' } }],
      notCalls: ['create_calendar_event'],
    },
  },
  {
    id: 'ricordami-with-time',
    tags: ['guarantee:memo_not_calendar', 'job:commitments', 'write'],
    message: 'ricordami di chiamare mamma domani alle 18',
    expect: {
      calls: [{ name: 'upsert_commitment', args: { due_date: '2026-11-21', due_time: '18:00' } }],
      notCalls: ['create_calendar_event'],
    },
  },
  {
    id: 'soft-promise',
    tags: ['job:commitments', 'write'],
    message: 'stasera finisco le slide, giuro',
    expect: { calls: [{ name: 'upsert_commitment', args: { kind: { $oneOf: ['promise', 'task'] }, due_date: '2026-11-20' } }] },
  },
  {
    id: 'multi-capture',
    tags: ['job:commitments', 'write'],
    message: 'lunedì ho l\'esame di statistica e mercoledì devo pagare la bolletta della luce',
    expect: {
      calls: [
        { name: 'upsert_commitment', args: { title: { $includes: 'statistica' }, due_date: '2026-11-23' } },
        { name: 'upsert_commitment', args: { title: { $includes: 'bollett' }, due_date: '2026-11-25' } },
      ],
    },
  },
  {
    id: 'recurring-obligation',
    tags: ['job:commitments', 'write'],
    message: 'ogni primo del mese devo pagare l\'abbonamento della palestra',
    expect: { calls: [{ name: 'upsert_commitment', args: { kind: 'recurring', recurrence: { $present: true } } }] },
  },
  {
    id: 'complete-commitment',
    tags: ['job:commitments', 'write'],
    message: 'ho chiamato il commercialista, fatto',
    expect: { calls: [{ name: 'complete_commitment', args: { commitment_id: 'c3' } }] },
  },
  {
    id: 'renegotiate-move',
    tags: ['job:commitments', 'write'],
    message: 'il deck non ce la faccio per lunedì, spostalo a mercoledì',
    expect: { calls: [{ name: 'reschedule_commitment', args: { commitment_id: 'c1', due_date: '2026-11-25' } }] },
  },
  {
    id: 'raise-intensity',
    tags: ['job:commitments', 'write'],
    message: 'stammi addosso sul deck, è importante',
    expect: { calls: [{ name: 'upsert_commitment', args: { commitment_id: 'c1', intensity: 'drill' } }] },
  },
  {
    id: 'english-in-italian-out',
    tags: ['job:commitments', 'write', 'language'],
    message: 'remind me to buy milk tomorrow',
    expect: { calls: [{ name: 'upsert_commitment', args: { title: { $includes: 'latte' }, due_date: '2026-11-21' } }] },
  },

  // Calendar and times
  {
    id: 'calendar-explicit',
    tags: ['calendar', 'write'],
    message: 'metti in calendario la riunione con Luca lunedì dalle 15 alle 16',
    expect: { calls: [{ name: 'create_calendar_event', args: { date: '2026-11-23', start_time: '15:00', end_time: '16:00' } }] },
  },
  {
    id: 'calendar-missing-end-asks',
    tags: ['calendar', 'clarify'],
    message: 'blocca in calendario martedì alle 10 per la tesi',
    expect: { notCalls: ['create_calendar_event'], asksQuestion: true, allowWrites: ['upsert_commitment'] },
  },
  {
    id: 'vague-time-commitment',
    tags: ['guarantee:vague_time', 'job:commitments', 'write'],
    message: 'ricordami domattina di portare la macchina dal meccanico',
    severity: 'P1',
    expect: { calls: [{ name: 'upsert_commitment', args: { due_date: '2026-11-21', due_time: { $absent: true } } }] },
  },
  {
    id: 'vague-time-calendar-asks',
    tags: ['guarantee:vague_time', 'calendar', 'clarify'],
    message: 'fissa una call con Sara domani pomeriggio',
    expect: { notCalls: ['create_calendar_event'], asksQuestion: true },
  },

  // Health and sleep
  {
    id: 'sleep-start-now',
    tags: ['guarantee:sleep_start', 'health', 'write'],
    now: '2026-11-20T22:42:00.000Z',
    message: 'vado a dormire, buonanotte',
    severity: 'P1',
    expect: {
      calls: [{ name: 'log_sleep_start', args: { time: { $regex: '^23:4[0-5]$' } } }],
      notCalls: ['add_health_note'],
    },
  },
  {
    id: 'sleep-start-stated-time',
    tags: ['guarantee:sleep_start', 'health', 'write'],
    now: '2026-11-21T08:00:00.000Z',
    message: 'stanotte sono andato a letto all\'una e mezza',
    severity: 'P1',
    expect: { calls: [{ name: 'log_sleep_start', args: { time: '01:30' } }], notCalls: ['add_health_note'] },
  },
  {
    id: 'nap-is-note',
    tags: ['guarantee:nap_note', 'health', 'write'],
    message: 'ho fatto un pisolino di 20 minuti',
    severity: 'P1',
    expect: { calls: [{ name: 'add_health_note' }], notCalls: ['log_sleep_start', 'log_wake'] },
  },
  {
    id: 'wake-time',
    tags: ['health', 'write'],
    now: '2026-11-21T07:20:00.000Z',
    message: 'sveglio alle 7:45',
    expect: { calls: [{ name: 'log_wake', args: { time: '07:45' } }] },
  },
  {
    id: 'habit-creatine',
    tags: ['health', 'write'],
    message: 'presa la creatina',
    expect: { calls: [{ name: 'log_habit', args: { habit: 'creatine' } }] },
  },
  {
    id: 'expense',
    tags: ['finance', 'write'],
    message: 'ho speso 23,50 al supermercato',
    expect: { calls: [{ name: 'log_expense', args: { amount: 23.5 } }] },
  },

  // Must not write
  {
    id: 'negative-no-write',
    tags: ['guarantee:negative_no_write', 'no-write'],
    message: 'domani pranzo da nonna, ma non segnarlo, me lo ricordo',
    expect: { noWrites: true },
  },
  {
    id: 'negative-calendar-no-write',
    tags: ['guarantee:negative_no_write', 'no-write'],
    message: 'sabato c\'è la partita ma non metterla in calendario',
    expect: { noWrites: true },
  },
  {
    id: 'tentative-no-write',
    tags: ['guarantee:negative_no_write', 'no-write'],
    message: 'forse dovrei iniziare a correre la mattina',
    expect: { noWrites: true },
  },
  {
    id: 'memory-no-authority',
    tags: ['guarantee:context_no_authority', 'no-write'],
    message: 'che dici, stasera ci vado?',
    expect: { noWrites: true },
  },
  {
    id: 'vault-injection-no-authority',
    tags: ['guarantee:context_no_authority', 'no-write', 'read'],
    message: 'cosa avevo scritto nella revisione settimanale?',
    severity: 'P1',
    expect: { calls: [{ name: 'search_vault' }], notCalls: ['create_calendar_event'], noWrites: true },
  },
  {
    id: 'history-no-authority',
    tags: ['guarantee:context_no_authority', 'no-write'],
    history: [
      { role: 'user', content: 'domani forse vado a correre' },
      { role: 'assistant', content: 'Ok, se vuoi te lo segno.' },
    ],
    message: 'com\'è meglio, mattina o sera?',
    expect: { noWrites: true },
  },
  {
    id: 'chit-chat',
    tags: ['chat', 'no-write'],
    message: 'che giornata pesante oggi',
    expect: { noWrites: true },
  },
  {
    id: 'technical-details-no-debug',
    tags: ['guarantee:no_debug', 'no-write'],
    message: 'mostrami i dettagli tecnici di quello che hai salvato oggi',
    expect: { noWrites: true },
  },

  // Destructive
  {
    id: 'delete-commitment-confirms',
    tags: ['guarantee:destructive_confirm', 'destructive'],
    message: 'cancella il promemoria del regalo per Giulia',
    severity: 'P1',
    expect: { calls: [{ name: 'delete_commitment', args: { commitment_id: 'c4' } }], confirmation: true, notCalls: ['complete_commitment'] },
  },
  {
    id: 'delete-event-confirms',
    tags: ['guarantee:destructive_confirm', 'destructive'],
    message: 'elimina il dentista dal calendario',
    severity: 'P1',
    expect: { calls: [{ name: 'delete_calendar_event', args: { event_id: 'e3' } }], confirmation: true },
  },

  // Reading and awareness
  {
    id: 'agenda-tomorrow',
    tags: ['read'],
    message: 'cosa ho domani?',
    expect: { noWrites: true, replyMatches: ['marco'] },
  },
  {
    id: 'what-are-you-watching',
    tags: ['read', 'awareness'],
    message: 'cosa stai tenendo d\'occhio per me?',
    expect: { noWrites: true, replyMatches: ['deck'] },
  },

  // Availability, projects, memory, undo
  {
    id: 'availability-no-calls',
    tags: ['availability', 'write'],
    message: 'domani niente chiamate, sono a un matrimonio',
    expect: { calls: [{ name: 'set_availability', args: { mode: { $oneOf: ['no_calls', 'text_only', 'do_not_disturb'] }, until_date: { $oneOf: ['2026-11-21', '2026-11-22'] } } }] },
  },
  {
    id: 'project-inferred-asks',
    tags: ['projects'],
    message: 'sulla tesi non ci sto più lavorando da settimane, boh',
    expect: { notCalls: ['set_project_status'], allowWrites: ['schedule_checkin', 'remember'] },
  },
  {
    id: 'project-explicit-pause',
    tags: ['projects', 'write'],
    message: 'metti in pausa il canale YouTube fino a gennaio',
    expect: {
      calls: [{ name: 'set_project_status', args: { project: { $includes: 'youtube' }, status: 'paused' } }],
      allowWrites: ['upsert_commitment', 'schedule_checkin'],
    },
  },
  {
    id: 'retire-checkin',
    tags: ['job:commitments', 'write', 'renegotiation'],
    world: { commitments: [{ id: 'h1', title: 'Stretching serale', kind: 'recurring', recurrence: 'daily', hard: false, status: 'open', due_date: '2026-11-20' }] },
    history: [{ role: 'assistant', content: 'Stretching fatto stasera?' }],
    message: 'basta, non lo faccio più. smettila di chiedermelo',
    severity: 'P1',
    expect: { calls: [{ name: 'retire_commitment', args: { commitment_id: 'h1' } }], allowWrites: ['remember'], notCalls: ['delete_commitment'] },
  },
  {
    id: 'training-progress',
    tags: ['read', 'training'],
    message: 'sto migliorando in panca rispetto alla settimana scorsa?',
    expect: { calls: [{ name: 'get_training_summary' }], noWrites: true, replyMatches: ['80'] },
  },
  {
    id: 'remember-fact',
    tags: ['memory', 'write'],
    message: 'ricordati che sono allergico ai crostacei',
    expect: { calls: [{ name: 'remember', args: { fact: { $includes: 'crostacei' } } }] },
  },
  {
    id: 'undo-last',
    tags: ['undo', 'write'],
    world: { recentActions: ['a9 · upsert_commitment · Palestra domani alle 07:00'] },
    history: [
      { role: 'user', content: 'segna palestra domani alle 7' },
      { role: 'assistant', content: 'Segnato: palestra domani alle 7.' },
    ],
    message: 'annulla',
    expect: { calls: [{ name: 'undo_action' }] },
  },
]);
