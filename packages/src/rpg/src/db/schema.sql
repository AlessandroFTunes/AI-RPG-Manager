create extension if not exists pgcrypto;

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  channel_id text not null,
  thread_id text not null unique,
  owner_id text not null,
  title text not null,
  system text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_guild_id_idx on campaigns (guild_id);
create index if not exists campaigns_thread_id_idx on campaigns (thread_id);
create index if not exists campaigns_status_idx on campaigns (status);
create index if not exists campaigns_state_gin_idx on campaigns using gin (state);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  discord_message_id text,
  author_id text,
  author_name text,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_campaign_id_created_at_idx on messages (campaign_id, created_at desc);
create index if not exists messages_discord_message_id_idx on messages (discord_message_id);
create index if not exists messages_metadata_gin_idx on messages using gin (metadata);

create table if not exists dice_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  author_id text,
  expression text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists dice_rolls_campaign_id_created_at_idx on dice_rolls (campaign_id, created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at
before update on campaigns
for each row execute function set_updated_at();
