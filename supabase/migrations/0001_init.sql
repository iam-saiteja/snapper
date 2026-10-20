-- Snapper schema. Strictness lives here, not in the app:
--   * tasks: clients may only INSERT/DELETE rows dated tomorrow or later (IST). No UPDATE at all.
--   * rules: insert-only, and only effective from tomorrow (except the very first rules row).
--   * points, unlocks, quizzes, emergencies: clients can read (some) but never write.
--     Only the Cloudflare functions (service role) write them.

create extension if not exists pg_cron;

create or replace function public.snapper_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ---------- tasks ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan text not null default '',
  task_date date not null,
  title text not null,
  topic text not null,
  deadline time not null default '21:00',
  quiz_questions int not null default 5 check (quiz_questions between 1 and 20),
  pass_score int not null default 4 check (pass_score >= 1),
  points int not null default 20 check (points >= 0),
  penalty int not null default 15 check (penalty >= 0),
  status text not null default 'pending' check (status in ('pending', 'done', 'missed')),
  created_at timestamptz not null default now(),
  check (pass_score <= quiz_questions)
);
create index on public.tasks (user_id, task_date);
alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select using (user_id = auth.uid());
create policy tasks_insert on public.tasks for insert
  with check (user_id = auth.uid() and task_date > public.snapper_today() and status = 'pending');
create policy tasks_delete on public.tasks for delete
  using (user_id = auth.uid() and task_date > public.snapper_today());

-- ---------- reminders (text; voice audio never leaves the phone) ----------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  remind_at timestamptz not null,
  text text not null,
  voice_local_path text,
  created_at timestamptz not null default now()
);
alter table public.reminders enable row level security;
create policy reminders_all on public.reminders for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- rules ----------
create table public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  effective_date date not null,
  rules jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.rules (user_id, effective_date desc, created_at desc);
alter table public.rules enable row level security;
create policy rules_select on public.rules for select using (user_id = auth.uid());
create policy rules_insert on public.rules for insert with check (
  user_id = auth.uid() and (
    effective_date > public.snapper_today()
    or (effective_date = public.snapper_today()
        and not exists (select 1 from public.rules r where r.user_id = auth.uid()))
  )
);

-- ---------- points ledger (append-only, server-written) ----------
create table public.points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  delta int not null,
  reason text not null,
  ref uuid,
  created_at timestamptz not null default now()
);
create index on public.points_ledger (user_id, created_at desc);
alter table public.points_ledger enable row level security;
create policy ledger_select on public.points_ledger for select using (user_id = auth.uid());

create or replace function public.point_balance(uid uuid) returns int
language sql stable as $$ select coalesce(sum(delta), 0)::int from public.points_ledger where user_id = uid $$;

-- ---------- quizzes (answer keys: no client access at all) ----------
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  questions jsonb not null,           -- [{q, answer}]
  answers jsonb not null default '[]',-- [{index, answer, correct, feedback}]
  status text not null default 'open' check (status in ('open', 'passed', 'failed')),
  created_at timestamptz not null default now()
);
alter table public.quizzes enable row level security;

-- ---------- unlocks ----------
create table public.unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  package text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  cost int not null default 0,
  kind text not null check (kind in ('points', 'emergency')),
  created_at timestamptz not null default now()
);
create index on public.unlocks (user_id, ends_at desc);
alter table public.unlocks enable row level security;
create policy unlocks_select on public.unlocks for select using (user_id = auth.uid());

-- ---------- emergencies ----------
create table public.emergencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  package text not null,
  explanation text not null,
  approved boolean not null,
  minutes int not null default 0,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.emergencies enable row level security;
create policy emergencies_select on public.emergencies for select using (user_id = auth.uid());

-- ---------- voice notes (transcripts only; audio stays on the phone) ----------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  local_path text not null,
  transcript text not null default '',
  duration_ms int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.notes enable row level security;
create policy notes_all on public.notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- saved links / reels ----------
create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  url text not null,
  note text not null default '',
  summary text not null default '',
  remind_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.links enable row level security;
create policy links_all on public.links for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- devices + violations (server-written) ----------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  token_hash text not null unique,
  a11y_enabled boolean not null default true,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);
alter table public.devices enable row level security;
create policy devices_select on public.devices for select using (user_id = auth.uid());

create table public.violations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
alter table public.violations enable row level security;
create policy violations_select on public.violations for select using (user_id = auth.uid());

-- ---------- missed deadlines -> penalty, every 5 minutes ----------
create or replace function public.apply_missed_penalties() returns void
language sql security definer set search_path = public as $$
  with missed as (
    update public.tasks set status = 'missed'
    where status = 'pending'
      and (task_date + deadline) < (now() at time zone 'Asia/Kolkata')
    returning id, user_id, penalty, title
  )
  insert into public.points_ledger (user_id, delta, reason, ref)
  select user_id, -penalty, 'missed: ' || title, id from missed where penalty > 0;
$$;
revoke all on function public.apply_missed_penalties() from public, anon, authenticated;

select cron.schedule('snapper-missed-penalties', '*/5 * * * *', 'select public.apply_missed_penalties()');
