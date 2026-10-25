-- Today's schedule can be added to (not just tomorrow onwards), as long as the task's deadline is still ahead,
-- so a new task can't be "missed" the moment it's added. Removing stays tomorrow-onwards only, and there is
-- still no UPDATE policy: today's tasks can be added but never edited or removed.
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert with check (
  user_id = auth.uid() and status = 'pending' and (
    task_date > public.snapper_today()
    or (task_date = public.snapper_today() and deadline > (now() at time zone 'Asia/Kolkata')::time)
  )
);

-- Ringing reminders are acknowledged by answering an AI question about them.
alter table public.reminders add column if not exists acked_at timestamptz;

-- The questions asked (with their key points). Server-only: no client policies.
create table if not exists public.reminder_acks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  reminder_id uuid not null references public.reminders on delete cascade,
  question text not null,
  key_points text not null,
  accepted boolean,
  created_at timestamptz not null default now()
);
create index if not exists reminder_acks_reminder on public.reminder_acks (reminder_id, created_at desc);
alter table public.reminder_acks enable row level security;
