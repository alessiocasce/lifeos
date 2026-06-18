export const dirtySleepStartPendingActions = [
  {
    name: 'activity sonno with start_time',
    pendingAction: {
      action_type: 'update_health_log',
      status: 'awaiting_fields',
      args: {
        activity: 'sonno',
        start_time: '03:41',
        date: '2026-06-18',
      },
      missing_fields: ['health_field'],
      confirmation_question: 'Che dettaglio devo usare?',
      language: 'it',
      confidence: 0.86,
    },
  },
  {
    name: 'health_field inizio sonno with start_time',
    pendingAction: {
      action_type: 'update_health_log',
      status: 'awaiting_fields',
      args: {
        health_field: 'inizio sonno',
        start_time: '03:41',
        logged_on: '2026-06-18',
      },
      missing_fields: ['health_field'],
      language: 'it',
      confidence: 0.86,
    },
  },
];

export const sleepStartSourceMessage = {
  message: 'Segna che sto andando a dormire ora alle 3.41am',
  candidate: {
    action_type: 'update_health_log',
    status: 'awaiting_fields',
    args: {
      activity: 'sonno',
      start_time: '3.41am',
      date: '2026-06-18',
    },
    source_user_message: 'Segna che sto andando a dormire ora alle 3.41am',
    missing_fields: ['health_field'],
    confirmation_question: 'Che dettaglio devo usare?',
    language: 'it',
    confidence: 0.86,
  },
};

export const pendingReplyIntentFixtures = {
  confirm: ['Si', 'Sì', 'SI', 'ok', 'confermo', 'procedi', 'fallo', 'yes', 'do it'],
  cancel: ['no', 'annulla', 'non farlo', 'lascia stare', 'cancel', "don't"],
  clarify: ['?', 'cosa?', 'non ho capito', 'what?'],
};

export const napHealthNoteCandidate = {
  action_type: 'update_health_log',
  args: {
    date: '2026-06-18',
    health_note_append: 'Pisolino: 19:40-22:00',
    nap_start_time: '19:40',
    nap_end_time: '22:00',
  },
  source_user_message: 'oggi ho fatto un pisolino dalle 7.40 alle 10 di sera',
  summary: 'Log nap today from 19:40 to 22:00',
  missing_fields: [],
  confirmation_required: true,
  language: 'it',
  confidence: 0.86,
};

export const staleSleepPendingAction = {
  action_type: 'log_sleep_start',
  status: 'awaiting_confirmation',
  confirmation_required: true,
  args: {
    time: '03:41',
    logged_on: '2026-06-18',
  },
  summary: 'Registrare inizio sonno alle 03:41',
  source_user_message: 'Segna che sto andando a dormire ora alle 3.41am',
  missing_fields: [],
  confirmation_question: 'Confermi che devo registrare l\'inizio del sonno alle 03:41?',
  language: 'it',
  confidence: 0.86,
};

export const calendarPendingMissingTime = {
  action_type: 'create_calendar_event',
  status: 'awaiting_fields',
  confirmation_required: false,
  args: {
    title: 'Sistemare il Vault',
    event_date: '2026-06-19',
    duration_minutes: 60,
  },
  summary: 'Bloccare un ora per sistemare il Vault',
  source_user_message: 'blocca domani un ora per sistemare il Vault dopo pranzo',
  missing_fields: ['start_time', 'end_time'],
  confirmation_question: 'Che orario esatto devo usare?',
  language: 'it',
  confidence: 0.9,
};

export const pendingInterruptionFixtures = {
  bypassNewCommands: [
    'Ricordami di fare matematica tra 10 minuti',
    'ricordami tra 2 minuti di lavarmi i denti',
    'segna creatina alle 9',
    'ho preso due caffe',
    'blocca domani palestra alle 18',
    'ho speso 4 euro per gelato',
    'sto andando a dormire ora',
    'crea memo antibiotico alle 15',
    'aggiungi evento studio domani 14:30-16:00',
  ],
  noBypassReplies: [
    'si',
    'Sì',
    'ok',
    'confermo',
    'no',
    'annulla',
    '?',
    'cosa?',
    'alle 14:30',
    '14:30-15:30',
    'domani alle 10',
    'usa lo stesso orario',
    'la data e il tempo che hai gia usato',
    'fai oggi e il tempo te l\'ho gia dato',
  ],
};

export const simpleWriteVaultFixtures = [
  { message: 'segnami creatina alle 9:37', skill: 'health_coach', action: 'update_health_log' },
  { message: 'sto andando a dormire alle 3:41', skill: 'health_coach', action: 'log_sleep_start' },
  { message: 'ho fatto doccia alle 10', skill: 'health_coach', action: 'update_health_log' },
  { message: 'ho preso due caffè', skill: 'health_coach', action: 'update_health_log' },
  { message: 'segna wake time 8:37', skill: 'health_coach', action: 'update_health_log' },
];

export const negativeWriteFixtures = [
  'non segnare niente',
  'non salvarlo',
  "don't log it",
  'si ma non segnarlo',
];

export const referentWorkingContextFixture = {
  brainChat: {
    conversationHistory: [
      {
        role: 'assistant',
        content: 'Salvato nella salute: Pisolino 19:40-22:00.',
        metadata: {
          working_context: {
            language: 'it',
            last_subject: {
              type: 'health_event',
              label: 'Pisolino',
              date: '2026-06-18',
              start_time: '19:40',
              end_time: '22:00',
              source: 'health_log_note',
              created_by_last_action: true,
              confidence: 0.9,
            },
            last_action_result: {
              action_type: 'update_health_log',
              status: 'success',
              summary: 'Salvato pisolino 19:40-22:00 in Health',
            },
          },
        },
      },
    ],
  },
  userMessage: 'aggiungilo anche al calendario',
};

export const whatsappThreadIdentityFixtures = [
  {
    sender: '111780936298528@lid',
    firstClientRequestId: 'whatsapp:111780936298528@lid:message-1',
    secondClientRequestId: 'whatsapp:111780936298528@lid:message-2',
  },
];

export const proactiveMemoFixtures = {
  timedMemo: {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    title: 'Prendere antibiotico',
    memo_date: '2026-06-18',
    memo_time: '09:30',
    status: 'open',
    notes: '',
  },
  dateOnlyMemo: {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: '22222222-2222-4222-8222-222222222222',
    title: 'Chiamare medico',
    memo_date: '2026-06-18',
    memo_time: null,
    status: 'open',
    notes: '',
  },
  closedMemo: {
    id: '44444444-4444-4444-8444-444444444444',
    user_id: '22222222-2222-4222-8222-222222222222',
    title: 'Gia fatto',
    memo_date: '2026-06-18',
    memo_time: '09:30',
    status: 'done',
    notes: '',
  },
  recipient: '111780936298528@lid',
};

export const proactiveReplyFixtures = {
  done: ['fatto', 'si', 'Sì', 'done', 'completed'],
  snooze: ['snooze 30', 'tra 30 min', 'piu tardi', 'domani alle 10', '15:30'],
  cancel: ['annulla', 'cancella', 'non ricordarmelo', 'cancel'],
  explain: ['?', 'perche?', 'why'],
};
