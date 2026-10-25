-- Same-day tasks need lead time, checked when they're written: a task's deadline must be at least 10 minutes away
-- (the app asks for 15, so an import it accepts never fails here). Compared as full India-time timestamps, so it
-- also works across midnight. Removing stays tomorrow-onwards and there's still no update policy.
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert with check (
  user_id = auth.uid() and status = 'pending'
  and task_date >= public.snapper_today()
  and (task_date + deadline) >= (now() at time zone 'Asia/Kolkata') + interval '10 minutes'
);

-- Imports a whole plan in one transaction: every task, reminder and (optional) rules row is saved, or none is, so a
-- failure (including rules refused by the DNS-lock guard) can never leave a partial import of tasks that can't be
-- removed. SECURITY INVOKER: the caller's row-level security, column privileges and triggers apply exactly as for
-- direct inserts.
drop function if exists public.import_plan(jsonb, jsonb);
create or replace function public.import_plan(p_tasks jsonb, p_reminders jsonb, p_rules jsonb default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  n_tasks int;
  n_reminders int;
  rules_effective date;
begin
  -- Rules first: the very first rules apply today, every later change from tomorrow (as in the Rules editor).
  if p_rules is not null then
    rules_effective := case
      when exists (select 1 from public.rules where user_id = auth.uid()) then public.snapper_today() + 1
      else public.snapper_today()
    end;
    insert into public.rules (effective_date, rules) values (rules_effective, p_rules);
  end if;

  insert into public.tasks (plan, task_date, title, topic, deadline, quiz_questions, pass_score, points, penalty)
  select t.plan, t.task_date, t.title, t.topic, t.deadline, t.quiz_questions, t.pass_score, t.points, t.penalty
  from jsonb_to_recordset(coalesce(p_tasks, '[]'::jsonb)) as t(
    plan text, task_date date, title text, topic text, deadline time,
    quiz_questions int, pass_score int, points int, penalty int
  );
  get diagnostics n_tasks = row_count;

  insert into public.reminders (remind_at, text)
  select r.remind_at, r.text
  from jsonb_to_recordset(coalesce(p_reminders, '[]'::jsonb)) as r(remind_at timestamptz, text text);
  get diagnostics n_reminders = row_count;

  return jsonb_build_object('tasks', n_tasks, 'reminders', n_reminders, 'rules_effective', rules_effective);
end $$;

revoke all on function public.import_plan(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_plan(jsonb, jsonb, jsonb) to authenticated;
