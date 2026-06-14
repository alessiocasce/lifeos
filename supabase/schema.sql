create extension if not exists pgcrypto;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  performed_on date not null default current_date,
  started_at timestamptz,
  ended_at timestamptz,
  template_id uuid,
  template_snapshot jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id uuid not null,
  exercise text not null,
  exercise_order integer not null check (exercise_order > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, exercise_order),
  foreign key (template_id, user_id) references public.workout_templates(id, user_id) on delete cascade
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id uuid not null,
  exercise text not null,
  set_number integer not null check (set_number > 0),
  is_warmup boolean not null default false,
  weight numeric(7,2) not null check (weight >= 0),
  reps integer not null check (reps > 0),
  rpe numeric(3,1) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  performed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_id, exercise, set_number),
  foreign key (workout_id, user_id) references public.workouts(id, user_id) on delete cascade
);

create table if not exists public.health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  sleep_hours numeric(4,2),
  sleep_start time,
  wake_time time,
  sleep_quality integer check (sleep_quality between 0 and 100),
  energy integer check (energy between 1 and 10),
  coffee integer not null default 0 check (coffee >= 0),
  water integer not null default 0 check (water >= 0),
  adc integer not null default 0 check (adc >= 0),
  mood integer check (mood between 1 and 10),
  social_time_minutes integer not null default 0 check (social_time_minutes >= 0),
  main_time_waster text,
  notes text,
  hygiene jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vendor text not null,
  category text not null,
  amount numeric(10,2) not null,
  spent_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  category text,
  location text,
  notes text,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  review_on date not null default current_date,
  wins text,
  risks text,
  next_actions jsonb not null default '[]'::jsonb,
  score integer check (score between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_on)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  title text,
  body text not null,
  widgets jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id text,
  source text not null default 'app' check (source in ('app', 'shortcut', 'api')),
  user_message text,
  answer text,
  status text not null default 'success' check (status in ('success', 'error')),
  action_type text,
  action_count integer not null default 0 check (action_count >= 0),
  actions jsonb not null default '[]'::jsonb,
  record_refs jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (id, user_id)
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  request_id uuid,
  action_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.ai_chat_threads(id, user_id) on delete cascade
);

create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null,
  title text not null,
  content text not null,
  source text not null default 'assistant_inferred' check (source in ('user_explicit', 'assistant_inferred', 'system', 'manual')),
  confidence numeric(3,2) not null default 0.80 check (confidence >= 0 and confidence <= 1),
  importance integer not null default 3 check (importance between 1 and 5),
  status text not null default 'active' check (status in ('active', 'archived')),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  insight_type text not null,
  title text not null,
  content text not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(3,2) not null default 0.70 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  memo_date date,
  memo_time time,
  notes text,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  goal_type text not null default 'hours' check (goal_type in ('hours', 'units', 'tasks', 'content', 'custom')),
  goal_label text,
  target_value numeric(10,2) not null,
  current_value numeric(10,2) not null default 0,
  unit_label text,
  overall_cost numeric(10,2) not null default 0,
  started_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.project_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer check (duration_minutes >= 0),
  target_output text,
  proof_of_work text,
  progress_delta numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade
);

create table if not exists public.project_money_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  type text not null check (type in ('expense', 'revenue')),
  amount numeric(10,2) not null check (amount >= 0),
  description text,
  entry_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade
);

alter table public.workouts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workouts alter column user_id set default auth.uid();
alter table public.workouts add column if not exists performed_on date not null default current_date;
alter table public.workouts add column if not exists started_at timestamptz;
alter table public.workouts add column if not exists ended_at timestamptz;
alter table public.workouts add column if not exists template_id uuid;
alter table public.workouts add column if not exists template_snapshot jsonb not null default '[]'::jsonb;

alter table public.workout_templates add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_templates alter column user_id set default auth.uid();
alter table public.workout_templates add column if not exists name text;
alter table public.workout_templates add column if not exists notes text;
alter table public.workout_templates add column if not exists created_at timestamptz not null default now();
alter table public.workout_templates add column if not exists updated_at timestamptz not null default now();

alter table public.workout_template_exercises add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_template_exercises alter column user_id set default auth.uid();
alter table public.workout_template_exercises add column if not exists template_id uuid;
alter table public.workout_template_exercises add column if not exists exercise text;
alter table public.workout_template_exercises add column if not exists exercise_order integer;
alter table public.workout_template_exercises alter column exercise_order set default 1;
update public.workout_template_exercises set exercise_order = 1 where exercise_order is null;
alter table public.workout_template_exercises alter column exercise_order set not null;
alter table public.workout_template_exercises add column if not exists notes text;
alter table public.workout_template_exercises add column if not exists created_at timestamptz not null default now();
alter table public.workout_template_exercises add column if not exists updated_at timestamptz not null default now();

alter table public.workout_sets add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_sets alter column user_id set default auth.uid();
alter table public.workout_sets add column if not exists set_number integer;
alter table public.workout_sets alter column set_number set default 1;
update public.workout_sets set set_number = 1 where set_number is null;
alter table public.workout_sets alter column set_number set not null;
alter table public.workout_sets add column if not exists is_warmup boolean not null default false;
alter table public.workout_sets alter column rpe drop not null;
alter table public.workout_sets drop constraint if exists workout_sets_rpe_check;

alter table public.health_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.health_logs alter column user_id set default auth.uid();
alter table public.health_logs add column if not exists sleep_start time;
alter table public.health_logs add column if not exists wake_time time;
alter table public.health_logs add column if not exists energy integer check (energy between 1 and 10);
alter table public.health_logs add column if not exists social_time_minutes integer not null default 0 check (social_time_minutes >= 0);
alter table public.health_logs add column if not exists main_time_waster text;
alter table public.health_logs add column if not exists notes text;
alter table public.health_logs add column if not exists adc integer not null default 0 check (adc >= 0);

alter table public.expenses add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.expenses alter column user_id set default auth.uid();

alter table public.calendar_events add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.calendar_events alter column user_id set default auth.uid();
alter table public.calendar_events add column if not exists title text;
alter table public.calendar_events add column if not exists event_date date;
alter table public.calendar_events add column if not exists start_time time;
alter table public.calendar_events add column if not exists end_time time;
alter table public.calendar_events add column if not exists category text;
alter table public.calendar_events add column if not exists location text;
alter table public.calendar_events add column if not exists notes text;
alter table public.calendar_events add column if not exists status text not null default 'planned';

alter table public.daily_reviews add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.daily_reviews alter column user_id set default auth.uid();

alter table public.chat_messages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.chat_messages alter column user_id set default auth.uid();

alter table public.ai_action_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_action_logs alter column user_id set default auth.uid();
alter table public.ai_action_logs add column if not exists request_id text;
alter table public.ai_action_logs add column if not exists source text not null default 'app';
alter table public.ai_action_logs add column if not exists user_message text;
alter table public.ai_action_logs add column if not exists answer text;
alter table public.ai_action_logs add column if not exists status text not null default 'success';
alter table public.ai_action_logs add column if not exists action_type text;
alter table public.ai_action_logs add column if not exists action_count integer not null default 0;
alter table public.ai_action_logs add column if not exists actions jsonb not null default '[]'::jsonb;
alter table public.ai_action_logs add column if not exists record_refs jsonb not null default '[]'::jsonb;
alter table public.ai_action_logs add column if not exists error_message text;
alter table public.ai_action_logs add column if not exists created_at timestamptz not null default now();

alter table public.ai_chat_threads add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_chat_threads alter column user_id set default auth.uid();
alter table public.ai_chat_threads add column if not exists title text not null default 'New Chat';
alter table public.ai_chat_threads add column if not exists status text not null default 'active';
alter table public.ai_chat_threads add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ai_chat_threads add column if not exists created_at timestamptz not null default now();
alter table public.ai_chat_threads add column if not exists updated_at timestamptz not null default now();
alter table public.ai_chat_threads add column if not exists last_message_at timestamptz;

alter table public.ai_chat_messages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_chat_messages alter column user_id set default auth.uid();
alter table public.ai_chat_messages add column if not exists thread_id uuid;
alter table public.ai_chat_messages add column if not exists role text;
alter table public.ai_chat_messages add column if not exists content text;
alter table public.ai_chat_messages add column if not exists request_id uuid;
alter table public.ai_chat_messages add column if not exists action_type text;
alter table public.ai_chat_messages add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ai_chat_messages add column if not exists created_at timestamptz not null default now();

alter table public.ai_memories add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_memories alter column user_id set default auth.uid();
alter table public.ai_memories add column if not exists category text;
alter table public.ai_memories add column if not exists title text;
alter table public.ai_memories add column if not exists content text;
alter table public.ai_memories add column if not exists source text not null default 'assistant_inferred';
alter table public.ai_memories add column if not exists confidence numeric(3,2) not null default 0.80;
alter table public.ai_memories add column if not exists importance integer not null default 3;
alter table public.ai_memories add column if not exists status text not null default 'active';
alter table public.ai_memories add column if not exists last_seen_at timestamptz;
alter table public.ai_memories add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ai_memories add column if not exists created_at timestamptz not null default now();
alter table public.ai_memories add column if not exists updated_at timestamptz not null default now();

alter table public.ai_insights add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_insights alter column user_id set default auth.uid();
alter table public.ai_insights add column if not exists insight_type text;
alter table public.ai_insights add column if not exists title text;
alter table public.ai_insights add column if not exists content text;
alter table public.ai_insights add column if not exists evidence jsonb not null default '[]'::jsonb;
alter table public.ai_insights add column if not exists confidence numeric(3,2) not null default 0.70;
alter table public.ai_insights add column if not exists status text not null default 'active';
alter table public.ai_insights add column if not exists created_at timestamptz not null default now();
alter table public.ai_insights add column if not exists updated_at timestamptz not null default now();

alter table public.memos add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.memos alter column user_id set default auth.uid();
alter table public.memos add column if not exists title text;
alter table public.memos add column if not exists memo_date date;
alter table public.memos add column if not exists memo_time time;
alter table public.memos add column if not exists notes text;
alter table public.memos add column if not exists status text not null default 'open';
alter table public.memos add column if not exists created_at timestamptz not null default now();
alter table public.memos add column if not exists updated_at timestamptz not null default now();

alter table public.projects add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.projects alter column user_id set default auth.uid();
alter table public.projects add column if not exists name text;
alter table public.projects add column if not exists status text not null default 'active';
alter table public.projects add column if not exists goal_type text not null default 'hours';
alter table public.projects add column if not exists goal_label text;
alter table public.projects add column if not exists target_value numeric(10,2);
alter table public.projects alter column target_value set default 0;
update public.projects set target_value = 0 where target_value is null;
alter table public.projects alter column target_value set not null;
alter table public.projects add column if not exists current_value numeric(10,2) not null default 0;
alter table public.projects add column if not exists unit_label text;
alter table public.projects add column if not exists overall_cost numeric(10,2) not null default 0;
alter table public.projects add column if not exists started_on date not null default current_date;
alter table public.projects add column if not exists notes text;
alter table public.projects add column if not exists created_at timestamptz not null default now();
alter table public.projects add column if not exists updated_at timestamptz not null default now();

alter table public.project_sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.project_sessions alter column user_id set default auth.uid();
alter table public.project_sessions add column if not exists project_id uuid;
alter table public.project_sessions add column if not exists started_at timestamptz not null default now();
alter table public.project_sessions add column if not exists ended_at timestamptz;
alter table public.project_sessions add column if not exists duration_minutes integer;
alter table public.project_sessions add column if not exists target_output text;
alter table public.project_sessions add column if not exists proof_of_work text;
alter table public.project_sessions add column if not exists progress_delta numeric(10,2) not null default 0;
alter table public.project_sessions add column if not exists created_at timestamptz not null default now();
alter table public.project_sessions add column if not exists updated_at timestamptz not null default now();

alter table public.project_money_entries add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.project_money_entries alter column user_id set default auth.uid();
alter table public.project_money_entries add column if not exists project_id uuid;
alter table public.project_money_entries add column if not exists type text;
alter table public.project_money_entries alter column type set default 'expense';
update public.project_money_entries set type = 'expense' where type is null;
alter table public.project_money_entries alter column type set not null;
alter table public.project_money_entries add column if not exists amount numeric(10,2);
alter table public.project_money_entries alter column amount set default 0;
update public.project_money_entries set amount = 0 where amount is null;
alter table public.project_money_entries alter column amount set not null;
alter table public.project_money_entries add column if not exists description text;
alter table public.project_money_entries add column if not exists entry_date date not null default current_date;
alter table public.project_money_entries add column if not exists created_at timestamptz not null default now();
alter table public.project_money_entries add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_sets_rpe_check'
  ) then
    alter table public.workout_sets
    add constraint workout_sets_rpe_check
    check (rpe is null or (rpe >= 0 and rpe <= 10));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_chat_threads_id_user_id_key'
  ) then
    alter table public.ai_chat_threads
    add constraint ai_chat_threads_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_chat_threads_status_check'
  ) then
    alter table public.ai_chat_threads
    add constraint ai_chat_threads_status_check
    check (status in ('active', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_chat_messages_role_check'
  ) then
    alter table public.ai_chat_messages
    add constraint ai_chat_messages_role_check
    check (role in ('user', 'assistant', 'system', 'tool'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_chat_messages_thread_id_user_id_fkey'
  ) then
    alter table public.ai_chat_messages
    add constraint ai_chat_messages_thread_id_user_id_fkey
    foreign key (thread_id, user_id) references public.ai_chat_threads(id, user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_memories_source_check'
  ) then
    alter table public.ai_memories
    add constraint ai_memories_source_check
    check (source in ('user_explicit', 'assistant_inferred', 'system', 'manual'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_memories_confidence_check'
  ) then
    alter table public.ai_memories
    add constraint ai_memories_confidence_check
    check (confidence >= 0 and confidence <= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_memories_importance_check'
  ) then
    alter table public.ai_memories
    add constraint ai_memories_importance_check
    check (importance between 1 and 5);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_memories_status_check'
  ) then
    alter table public.ai_memories
    add constraint ai_memories_status_check
    check (status in ('active', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_insights_confidence_check'
  ) then
    alter table public.ai_insights
    add constraint ai_insights_confidence_check
    check (confidence >= 0 and confidence <= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_insights_status_check'
  ) then
    alter table public.ai_insights
    add constraint ai_insights_status_check
    check (status in ('active', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_events_status_check'
  ) then
    alter table public.calendar_events
    add constraint calendar_events_status_check
    check (status in ('planned', 'done', 'skipped', 'cancelled'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workouts_id_user_id_key'
  ) then
    alter table public.workouts add constraint workouts_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_templates_user_id_name_key'
  ) then
    alter table public.workout_templates add constraint workout_templates_user_id_name_key unique (user_id, name);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_templates_id_user_id_key'
  ) then
    alter table public.workout_templates add constraint workout_templates_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_template_exercises_template_id_exercise_order_key'
  ) then
    alter table public.workout_template_exercises
    add constraint workout_template_exercises_template_id_exercise_order_key unique (template_id, exercise_order);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_template_exercises_exercise_order_check'
  ) then
    alter table public.workout_template_exercises
    add constraint workout_template_exercises_exercise_order_check
    check (exercise_order > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_template_exercises_template_id_user_id_fkey'
  ) then
    alter table public.workout_template_exercises
    add constraint workout_template_exercises_template_id_user_id_fkey
    foreign key (template_id, user_id) references public.workout_templates(id, user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_sets_workout_id_user_id_fkey'
  ) then
    alter table public.workout_sets
    add constraint workout_sets_workout_id_user_id_fkey
    foreign key (workout_id, user_id) references public.workouts(id, user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_action_logs_source_check'
  ) then
    alter table public.ai_action_logs
    add constraint ai_action_logs_source_check
    check (source in ('app', 'shortcut', 'api'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_action_logs_status_check'
  ) then
    alter table public.ai_action_logs
    add constraint ai_action_logs_status_check
    check (status in ('success', 'error'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_action_logs_action_count_check'
  ) then
    alter table public.ai_action_logs
    add constraint ai_action_logs_action_count_check
    check (action_count >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'memos_status_check'
  ) then
    alter table public.memos
    add constraint memos_status_check
    check (status in ('open', 'done', 'dismissed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_id_user_id_key'
  ) then
    alter table public.projects add constraint projects_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_status_check'
  ) then
    alter table public.projects
    add constraint projects_status_check
    check (status in ('active', 'paused', 'completed', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_goal_type_check'
  ) then
    alter table public.projects
    add constraint projects_goal_type_check
    check (goal_type in ('hours', 'units', 'tasks', 'content', 'custom'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_sessions_duration_minutes_check'
  ) then
    alter table public.project_sessions
    add constraint project_sessions_duration_minutes_check
    check (duration_minutes >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_sessions_project_id_user_id_fkey'
  ) then
    alter table public.project_sessions
    add constraint project_sessions_project_id_user_id_fkey
    foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_money_entries_type_check'
  ) then
    alter table public.project_money_entries
    add constraint project_money_entries_type_check
    check (type in ('expense', 'revenue'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_money_entries_amount_check'
  ) then
    alter table public.project_money_entries
    add constraint project_money_entries_amount_check
    check (amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_money_entries_project_id_user_id_fkey'
  ) then
    alter table public.project_money_entries
    add constraint project_money_entries_project_id_user_id_fkey
    foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade;
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_workouts_updated_at on public.workouts;
create trigger set_workouts_updated_at
before update on public.workouts
for each row execute function public.set_updated_at();

drop trigger if exists set_workout_templates_updated_at on public.workout_templates;
create trigger set_workout_templates_updated_at
before update on public.workout_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_workout_template_exercises_updated_at on public.workout_template_exercises;
create trigger set_workout_template_exercises_updated_at
before update on public.workout_template_exercises
for each row execute function public.set_updated_at();

drop trigger if exists set_workout_sets_updated_at on public.workout_sets;
create trigger set_workout_sets_updated_at
before update on public.workout_sets
for each row execute function public.set_updated_at();

drop trigger if exists set_health_logs_updated_at on public.health_logs;
create trigger set_health_logs_updated_at
before update on public.health_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_reviews_updated_at on public.daily_reviews;
create trigger set_daily_reviews_updated_at
before update on public.daily_reviews
for each row execute function public.set_updated_at();

drop trigger if exists set_chat_messages_updated_at on public.chat_messages;
create trigger set_chat_messages_updated_at
before update on public.chat_messages
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_chat_threads_updated_at on public.ai_chat_threads;
create trigger set_ai_chat_threads_updated_at
before update on public.ai_chat_threads
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_memories_updated_at on public.ai_memories;
create trigger set_ai_memories_updated_at
before update on public.ai_memories
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_insights_updated_at on public.ai_insights;
create trigger set_ai_insights_updated_at
before update on public.ai_insights
for each row execute function public.set_updated_at();

drop trigger if exists set_memos_updated_at on public.memos;
create trigger set_memos_updated_at
before update on public.memos
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_project_sessions_updated_at on public.project_sessions;
create trigger set_project_sessions_updated_at
before update on public.project_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_project_money_entries_updated_at on public.project_money_entries;
create trigger set_project_money_entries_updated_at
before update on public.project_money_entries
for each row execute function public.set_updated_at();

create index if not exists workouts_user_performed_on_idx on public.workouts (user_id, performed_on desc);
create index if not exists workout_templates_user_name_idx on public.workout_templates (user_id, name);
create index if not exists workout_template_exercises_template_order_idx on public.workout_template_exercises (template_id, exercise_order);
create index if not exists workout_sets_user_performed_at_idx on public.workout_sets (user_id, performed_at desc);
create index if not exists workout_sets_workout_id_idx on public.workout_sets (workout_id);
create index if not exists workout_sets_exercise_idx on public.workout_sets (user_id, exercise);
create index if not exists health_logs_user_logged_on_idx on public.health_logs (user_id, logged_on desc);
create index if not exists expenses_user_spent_on_idx on public.expenses (user_id, spent_on desc);
create index if not exists calendar_events_user_event_date_idx on public.calendar_events (user_id, event_date desc);
create index if not exists daily_reviews_user_review_on_idx on public.daily_reviews (user_id, review_on desc);
create index if not exists chat_messages_user_created_at_idx on public.chat_messages (user_id, created_at asc);
create index if not exists ai_action_logs_user_created_at_idx on public.ai_action_logs (user_id, created_at desc);
create index if not exists ai_action_logs_user_request_id_idx on public.ai_action_logs (user_id, request_id);
create index if not exists ai_chat_threads_user_updated_at_idx on public.ai_chat_threads (user_id, updated_at desc);
create index if not exists ai_chat_threads_user_last_message_at_idx on public.ai_chat_threads (user_id, last_message_at desc);
create index if not exists ai_chat_threads_user_status_idx on public.ai_chat_threads (user_id, status);
create index if not exists ai_chat_messages_user_thread_created_at_idx on public.ai_chat_messages (user_id, thread_id, created_at asc);
create index if not exists ai_chat_messages_user_created_at_idx on public.ai_chat_messages (user_id, created_at desc);
create index if not exists ai_chat_messages_user_request_id_idx on public.ai_chat_messages (user_id, request_id);
create index if not exists ai_memories_user_status_importance_idx on public.ai_memories (user_id, status, importance desc, updated_at desc);
create index if not exists ai_memories_user_category_idx on public.ai_memories (user_id, category);
create index if not exists ai_memories_user_last_seen_at_idx on public.ai_memories (user_id, last_seen_at desc);
create index if not exists ai_insights_user_status_created_at_idx on public.ai_insights (user_id, status, created_at desc);
create index if not exists ai_insights_user_type_created_at_idx on public.ai_insights (user_id, insight_type, created_at desc);
create index if not exists memos_user_status_due_idx on public.memos (user_id, status, memo_date, memo_time);
create index if not exists memos_user_created_at_idx on public.memos (user_id, created_at desc);
create index if not exists projects_user_status_created_at_idx on public.projects (user_id, status, created_at desc);
create index if not exists project_sessions_user_project_started_at_idx on public.project_sessions (user_id, project_id, started_at desc);
create index if not exists project_sessions_user_ended_at_idx on public.project_sessions (user_id, ended_at);
create index if not exists project_money_entries_user_project_entry_date_idx on public.project_money_entries (user_id, project_id, entry_date desc);
create index if not exists project_money_entries_user_created_at_idx on public.project_money_entries (user_id, created_at desc);

alter table public.workouts enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.health_logs enable row level security;
alter table public.expenses enable row level security;
alter table public.calendar_events enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.chat_messages enable row level security;
alter table public.ai_action_logs enable row level security;
alter table public.ai_chat_threads enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_memories enable row level security;
alter table public.ai_insights enable row level security;
alter table public.memos enable row level security;
alter table public.projects enable row level security;
alter table public.project_sessions enable row level security;
alter table public.project_money_entries enable row level security;

drop policy if exists "lifeos local read workouts" on public.workouts;
drop policy if exists "lifeos local write workouts" on public.workouts;
drop policy if exists "workouts are user scoped" on public.workouts;
create policy "workouts are user scoped" on public.workouts
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read workout_templates" on public.workout_templates;
drop policy if exists "lifeos local write workout_templates" on public.workout_templates;
drop policy if exists "workout_templates are user scoped" on public.workout_templates;
create policy "workout_templates are user scoped" on public.workout_templates
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read workout_template_exercises" on public.workout_template_exercises;
drop policy if exists "lifeos local write workout_template_exercises" on public.workout_template_exercises;
drop policy if exists "workout_template_exercises are user scoped" on public.workout_template_exercises;
create policy "workout_template_exercises are user scoped" on public.workout_template_exercises
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.workout_templates
    where workout_templates.id = workout_template_exercises.template_id
      and workout_templates.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workout_templates
    where workout_templates.id = workout_template_exercises.template_id
      and workout_templates.user_id = auth.uid()
  )
);

drop policy if exists "lifeos local read workout_sets" on public.workout_sets;
drop policy if exists "lifeos local write workout_sets" on public.workout_sets;
drop policy if exists "workout_sets are user scoped" on public.workout_sets;
create policy "workout_sets are user scoped" on public.workout_sets
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.workouts
    where workouts.id = workout_sets.workout_id
      and workouts.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workouts
    where workouts.id = workout_sets.workout_id
      and workouts.user_id = auth.uid()
  )
);

drop policy if exists "lifeos local read health_logs" on public.health_logs;
drop policy if exists "lifeos local write health_logs" on public.health_logs;
drop policy if exists "health_logs are user scoped" on public.health_logs;
create policy "health_logs are user scoped" on public.health_logs
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read expenses" on public.expenses;
drop policy if exists "lifeos local write expenses" on public.expenses;
drop policy if exists "expenses are user scoped" on public.expenses;
create policy "expenses are user scoped" on public.expenses
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read calendar_events" on public.calendar_events;
drop policy if exists "lifeos local write calendar_events" on public.calendar_events;
drop policy if exists "calendar_events are user scoped" on public.calendar_events;
create policy "calendar_events are user scoped" on public.calendar_events
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read daily_reviews" on public.daily_reviews;
drop policy if exists "lifeos local write daily_reviews" on public.daily_reviews;
drop policy if exists "daily_reviews are user scoped" on public.daily_reviews;
create policy "daily_reviews are user scoped" on public.daily_reviews
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read chat_messages" on public.chat_messages;
drop policy if exists "lifeos local write chat_messages" on public.chat_messages;
drop policy if exists "chat_messages are user scoped" on public.chat_messages;
create policy "chat_messages are user scoped" on public.chat_messages
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read ai_action_logs" on public.ai_action_logs;
drop policy if exists "lifeos local write ai_action_logs" on public.ai_action_logs;
drop policy if exists "ai_action_logs are user scoped" on public.ai_action_logs;
create policy "ai_action_logs are user scoped" on public.ai_action_logs
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ai_chat_threads are user scoped" on public.ai_chat_threads;
create policy "ai_chat_threads are user scoped" on public.ai_chat_threads
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ai_chat_messages are user scoped" on public.ai_chat_messages;
create policy "ai_chat_messages are user scoped" on public.ai_chat_messages
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.ai_chat_threads
    where ai_chat_threads.id = ai_chat_messages.thread_id
      and ai_chat_threads.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.ai_chat_threads
    where ai_chat_threads.id = ai_chat_messages.thread_id
      and ai_chat_threads.user_id = auth.uid()
  )
);

drop policy if exists "ai_memories are user scoped" on public.ai_memories;
create policy "ai_memories are user scoped" on public.ai_memories
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ai_insights are user scoped" on public.ai_insights;
create policy "ai_insights are user scoped" on public.ai_insights
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read memos" on public.memos;
drop policy if exists "lifeos local write memos" on public.memos;
drop policy if exists "memos are user scoped" on public.memos;
create policy "memos are user scoped" on public.memos
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read projects" on public.projects;
drop policy if exists "lifeos local write projects" on public.projects;
drop policy if exists "projects are user scoped" on public.projects;
create policy "projects are user scoped" on public.projects
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read project_sessions" on public.project_sessions;
drop policy if exists "lifeos local write project_sessions" on public.project_sessions;
drop policy if exists "project_sessions are user scoped" on public.project_sessions;
create policy "project_sessions are user scoped" on public.project_sessions
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = project_sessions.project_id
      and projects.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = project_sessions.project_id
      and projects.user_id = auth.uid()
  )
);

drop policy if exists "lifeos local read project_money_entries" on public.project_money_entries;
drop policy if exists "lifeos local write project_money_entries" on public.project_money_entries;
drop policy if exists "project_money_entries are user scoped" on public.project_money_entries;
create policy "project_money_entries are user scoped" on public.project_money_entries
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = project_money_entries.project_id
      and projects.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = project_money_entries.project_id
      and projects.user_id = auth.uid()
  )
);
