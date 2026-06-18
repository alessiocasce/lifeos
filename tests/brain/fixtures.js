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

