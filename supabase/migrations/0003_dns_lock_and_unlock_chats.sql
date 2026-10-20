-- DNS lock: whether the device last reported the required Private DNS as set.
-- Starts false so a device that never had it set isn't penalised for "changing" it.
alter table public.devices add column if not exists dns_ok boolean not null default false;

-- Unlock requests are conversations with the AI. Server-written only; the user can read their own.
create table if not exists public.unlock_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  package text not null,
  name text not null,
  messages jsonb not null default '[]', -- [{role: 'user' | 'assistant', content, at}]
  status text not null default 'open' check (status in ('open', 'approved', 'denied')),
  created_at timestamptz not null default now()
);
create index if not exists unlock_chats_user_created on public.unlock_chats (user_id, created_at desc);
alter table public.unlock_chats enable row level security;
drop policy if exists unlock_chats_select on public.unlock_chats;
create policy unlock_chats_select on public.unlock_chats for select using (user_id = auth.uid());
