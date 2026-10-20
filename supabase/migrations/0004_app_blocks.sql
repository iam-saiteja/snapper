-- Apps the user blocks themselves from the Apps tab.
--   mode 'soft'        : a convenience block the user can remove any time.
--   mode 'until_tasks' : blocked while any of today's tasks are still pending; the user CANNOT remove it
--                        (a commitment), so RLS forbids deleting those rows.
create table if not exists public.app_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  package text not null,
  name text not null,
  mode text not null check (mode in ('soft', 'until_tasks')),
  created_at timestamptz not null default now(),
  unique (user_id, package)
);
alter table public.app_blocks enable row level security;

drop policy if exists app_blocks_select on public.app_blocks;
create policy app_blocks_select on public.app_blocks for select using (user_id = auth.uid());

drop policy if exists app_blocks_insert on public.app_blocks;
create policy app_blocks_insert on public.app_blocks for insert with check (user_id = auth.uid());

-- Soft blocks are removable; until_tasks blocks are not (that's the point of the mode).
drop policy if exists app_blocks_delete on public.app_blocks;
create policy app_blocks_delete on public.app_blocks for delete using (user_id = auth.uid() and mode = 'soft');

-- Switching an until_tasks block to soft would be a loophole, so only soft rows may be updated.
drop policy if exists app_blocks_update on public.app_blocks;
create policy app_blocks_update on public.app_blocks for update using (user_id = auth.uid() and mode = 'soft');
