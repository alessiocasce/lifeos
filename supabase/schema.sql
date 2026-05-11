create extension if not exists pgcrypto;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  performed_on date not null default current_date,
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id uuid not null,
  exercise text not null,
  set_number integer not null check (set_number > 0),
  weight numeric(7,2) not null check (weight >= 0),
  reps integer not null check (reps > 0),
  rpe numeric(3,1) not null check (rpe >= 0 and rpe <= 10),
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

alter table public.workouts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workouts alter column user_id set default auth.uid();
alter table public.workouts add column if not exists performed_on date not null default current_date;
alter table public.workouts add column if not exists started_at timestamptz;
alter table public.workouts add column if not exists ended_at timestamptz;

alter table public.workout_sets add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_sets alter column user_id set default auth.uid();
alter table public.workout_sets add column if not exists set_number integer;
alter table public.workout_sets alter column set_number set default 1;
update public.workout_sets set set_number = 1 where set_number is null;
alter table public.workout_sets alter column set_number set not null;

alter table public.health_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.health_logs alter column user_id set default auth.uid();
alter table public.health_logs add column if not exists sleep_start time;
alter table public.health_logs add column if not exists wake_time time;
alter table public.health_logs add column if not exists energy integer check (energy between 1 and 10);
alter table public.health_logs add column if not exists social_time_minutes integer not null default 0 check (social_time_minutes >= 0);
alter table public.health_logs add column if not exists main_time_waster text;
alter table public.health_logs add column if not exists notes text;

alter table public.expenses add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.expenses alter column user_id set default auth.uid();

alter table public.daily_reviews add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.daily_reviews alter column user_id set default auth.uid();

alter table public.chat_messages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.chat_messages alter column user_id set default auth.uid();

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
    where conname = 'workout_sets_workout_id_user_id_fkey'
  ) then
    alter table public.workout_sets
    add constraint workout_sets_workout_id_user_id_fkey
    foreign key (workout_id, user_id) references public.workouts(id, user_id) on delete cascade;
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

create index if not exists workouts_user_performed_on_idx on public.workouts (user_id, performed_on desc);
create index if not exists workout_sets_user_performed_at_idx on public.workout_sets (user_id, performed_at desc);
create index if not exists workout_sets_workout_id_idx on public.workout_sets (workout_id);
create index if not exists workout_sets_exercise_idx on public.workout_sets (user_id, exercise);
create index if not exists health_logs_user_logged_on_idx on public.health_logs (user_id, logged_on desc);
create index if not exists expenses_user_spent_on_idx on public.expenses (user_id, spent_on desc);
create index if not exists daily_reviews_user_review_on_idx on public.daily_reviews (user_id, review_on desc);
create index if not exists chat_messages_user_created_at_idx on public.chat_messages (user_id, created_at asc);

alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.health_logs enable row level security;
alter table public.expenses enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "lifeos local read workouts" on public.workouts;
drop policy if exists "lifeos local write workouts" on public.workouts;
drop policy if exists "workouts are user scoped" on public.workouts;
create policy "workouts are user scoped" on public.workouts
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

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
