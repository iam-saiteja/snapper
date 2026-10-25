-- Only the server may mark a reminder acknowledged (after grading the answer to its question). Clients can
-- still create, reschedule and delete their own reminders, but can't set or preset acked_at.
revoke insert, update on public.reminders from anon, authenticated;
grant insert (id, user_id, remind_at, text, voice_local_path) on public.reminders to authenticated;
grant update (remind_at, text, voice_local_path) on public.reminders to authenticated;
