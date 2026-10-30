-- Onebox schema. Every row belongs to one user; RLS keeps users to their own data.
-- Webhooks write with the service-role key (they arrive with no user session).

create extension if not exists pgcrypto;

-- One row per account a user connects: Google (Gmail + Calendar), a WhatsApp
-- Business number, a Facebook Page (Messenger) or a Viber bot.
create table public.connections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider        text not null check (provider in ('google','whatsapp','messenger','viber')),
  label           text not null,
  -- Phone number ID, Page ID, Viber bot ID or Google email.
  external_id     text,
  -- AES-256-GCM ciphertext of the provider credentials (tokens, app secret). Never sent to the browser.
  credentials_enc text not null,
  -- Random token a provider must echo when verifying the webhook (WhatsApp, Messenger).
  verify_token    text not null default encode(gen_random_bytes(18), 'hex'),
  status          text not null default 'active' check (status in ('active','error','disconnected')),
  status_detail   text,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.connections (user_id);

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  connection_id    uuid not null references public.connections(id) on delete cascade,
  provider         text not null,
  -- WhatsApp wa_id, Messenger PSID, Viber user id, or Gmail thread id.
  external_id      text not null,
  title            text not null,
  participant      text,
  -- Where a reply goes: phone, PSID, Viber id, or email address.
  reply_to         text,
  last_message_at  timestamptz not null default now(),
  unread           boolean not null default true,
  archived         boolean not null default false,
  replied_at       timestamptz,
  created_at       timestamptz not null default now(),
  unique (connection_id, external_id)
);
create index on public.conversations (user_id, last_message_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  external_id      text,
  direction        text not null check (direction in ('in','out')),
  sender           text not null,
  body             text not null,
  sent_at          timestamptz not null default now(),
  unique (conversation_id, external_id)
);
create index on public.messages (conversation_id, sent_at);

-- The AI's read of a conversation. Recomputed when new messages arrive.
create table public.insights (
  conversation_id  uuid primary key references public.conversations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  summary          text not null,
  detail           text not null,
  needs_reply      boolean not null,
  verdict          text not null,
  priority         int  not null default 2 check (priority between 1 and 3),
  replies          jsonb,
  event            jsonb,
  message_count    int not null default 0,
  analyzed_at      timestamptz not null default now()
);

create table public.calendar_adds (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  google_event_id  text not null,
  html_link        text,
  title            text not null,
  starts_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (conversation_id)
);

alter table public.connections   enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.insights      enable row level security;
alter table public.calendar_adds enable row level security;

-- Users read their own rows. Writes go through server routes using the service role,
-- so the browser can never write credentials or forge messages.
create policy "own connections"   on public.connections   for select using (user_id = auth.uid());
create policy "own conversations" on public.conversations for select using (user_id = auth.uid());
create policy "own messages"      on public.messages      for select using (user_id = auth.uid());
create policy "own insights"      on public.insights      for select using (user_id = auth.uid());
create policy "own calendar adds" on public.calendar_adds for select using (user_id = auth.uid());

-- Hide ciphertext and webhook secrets from the client even on its own rows:
-- a table-level grant would override a column revoke, so grant columns explicitly.
revoke all on public.connections from anon, authenticated;
grant select (id, user_id, provider, label, external_id, status, status_detail, last_synced_at, created_at)
  on public.connections to authenticated;
revoke insert, update, delete on public.conversations, public.messages, public.insights, public.calendar_adds
  from anon, authenticated;
