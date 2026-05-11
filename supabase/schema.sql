create extension if not exists pgcrypto;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  performed_on date not null default current_date,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid references public.workouts(id) on delete set null,
  exercise text not null,
  weight numeric(7,2) not null check (weight >= 0),
  reps integer not null check (reps > 0),
  rpe numeric(3,1) not null check (rpe >= 0 and rpe <= 10),
  performed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_logs (
  id uuid primary key default gen_random_uuid(),
  logged_on date not null unique default current_date,
  sleep_hours numeric(4,2),
  sleep_quality integer check (sleep_quality between 0 and 100),
  coffee integer not null default 0 check (coffee >= 0),
  water integer not null default 0 check (water >= 0),
  mood integer check (mood between 1 and 10),
  hygiene jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  vendor text not null,
  category text not null,
  amount numeric(10,2) not null,
  spent_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  review_on date not null unique default current_date,
  wins text,
  risks text,
  next_actions jsonb not null default '[]'::jsonb,
  score integer check (score between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user', 'assistant', 'system')),
  title text,
  body text not null,
  widgets jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

drop trigger if exists set_daily_reviews_updated_at on public.daily_reviews;
create trigger set_daily_reviews_updated_at
before update on public.daily_reviews
for each row execute function public.set_updated_at();

drop trigger if exists set_chat_messages_updated_at on public.chat_messages;
create trigger set_chat_messages_updated_at
before update on public.chat_messages
for each row execute function public.set_updated_at();

create index if not exists workout_sets_performed_at_idx on public.workout_sets (performed_at desc);
create index if not exists workout_sets_exercise_idx on public.workout_sets (exercise);
create index if not exists expenses_spent_on_idx on public.expenses (spent_on desc);
create index if not exists chat_messages_created_at_idx on public.chat_messages (created_at asc);

alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.health_logs enable row level security;
alter table public.expenses enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "lifeos local read workouts" on public.workouts;
create policy "lifeos local read workouts" on public.workouts for select to anon, authenticated using (true);
drop policy if exists "lifeos local write workouts" on public.workouts;
create policy "lifeos local write workouts" on public.workouts for all to anon, authenticated using (true) with check (true);

drop policy if exists "lifeos local read workout_sets" on public.workout_sets;
create policy "lifeos local read workout_sets" on public.workout_sets for select to anon, authenticated using (true);
drop policy if exists "lifeos local write workout_sets" on public.workout_sets;
create policy "lifeos local write workout_sets" on public.workout_sets for all to anon, authenticated using (true) with check (true);

drop policy if exists "lifeos local read health_logs" on public.health_logs;
create policy "lifeos local read health_logs" on public.health_logs for select to anon, authenticated using (true);
drop policy if exists "lifeos local write health_logs" on public.health_logs;
create policy "lifeos local write health_logs" on public.health_logs for all to anon, authenticated using (true) with check (true);

drop policy if exists "lifeos local read expenses" on public.expenses;
create policy "lifeos local read expenses" on public.expenses for select to anon, authenticated using (true);
drop policy if exists "lifeos local write expenses" on public.expenses;
create policy "lifeos local write expenses" on public.expenses for all to anon, authenticated using (true) with check (true);

drop policy if exists "lifeos local read daily_reviews" on public.daily_reviews;
create policy "lifeos local read daily_reviews" on public.daily_reviews for select to anon, authenticated using (true);
drop policy if exists "lifeos local write daily_reviews" on public.daily_reviews;
create policy "lifeos local write daily_reviews" on public.daily_reviews for all to anon, authenticated using (true) with check (true);

drop policy if exists "lifeos local read chat_messages" on public.chat_messages;
create policy "lifeos local read chat_messages" on public.chat_messages for select to anon, authenticated using (true);
drop policy if exists "lifeos local write chat_messages" on public.chat_messages;
create policy "lifeos local write chat_messages" on public.chat_messages for all to anon, authenticated using (true) with check (true);
