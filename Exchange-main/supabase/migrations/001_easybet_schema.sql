create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.casse (
  id text primary key,
  nome text not null,
  saldo_iniziale numeric not null default 0,
  created_at bigint not null
);

create table if not exists public.bets (
  id text primary key,
  cassa_id text references public.casse(id) on delete cascade,
  data text,
  ora text,
  campionato text,
  casa text,
  trasferta text,
  strategia text,
  tipo text,
  quota text,
  importo text,
  commissione numeric,
  ht text,
  ft text,
  esito text,
  created_at bigint
);

create table if not exists public.settings (
  id text primary key default 'main',
  strategia text,
  tipo text,
  commissione numeric
);

create table if not exists public.matches (
  id text primary key,
  data text not null,
  ora text not null,
  campionato text default '',
  casa text not null,
  trasferta text not null,
  tipo_giocata text default '',
  start_at bigint not null,
  notify_minutes integer not null default 10,
  notified boolean not null default false,
  created_at bigint not null,
  live_strategy text,
  live_favorita text,
  live_alert_sent boolean not null default false,
  live_last_level text,
  live_last_summary text,
  live_last_updated bigint,
  quota_ingresso text,
  esito_manuale text,
  bot_enabled boolean not null default true
);
create index if not exists idx_matches_start_at on public.matches(start_at);

create table if not exists public.subscribers (
  chat_id text primary key,
  username text default '',
  created_at bigint not null
);

create table if not exists public.alert_settings (
  id text primary key default 'main',
  notify_minutes integer not null default 10,
  telegram_offset bigint not null default 0
);
insert into public.alert_settings (id, notify_minutes, telegram_offset)
values ('main', 10, 0)
on conflict (id) do nothing;

create table if not exists public.team_crests (
  name_norm text primary key,
  nome_originale text,
  url text,
  fetched_at bigint not null,
  manual boolean not null default false
);

-- Atomically claims one pending Telegram alert so concurrent cron invocations do not duplicate it.
create or replace function public.claim_match_notification(p_id text)
returns setof public.matches
language sql
security definer
set search_path = public
as $$
  update public.matches
  set notified = true
  where id = p_id
    and notified = false
    and bot_enabled = true
  returning *;
$$;

revoke all on function public.claim_match_notification(text) from public;
grant execute on function public.claim_match_notification(text) to service_role;
