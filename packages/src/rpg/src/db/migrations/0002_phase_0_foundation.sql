update campaigns
set state = jsonb_build_object(
  'stateVersion', 1,
  'system', system,
  'ruleset', 'narrative',
  'phase', 'playing',
  'setup', jsonb_build_object('premise', '', 'tone', '', 'boundaries', '[]'::jsonb),
  'voice', jsonb_build_object('enabled', false, 'channelId', null, 'provider', 'piper'),
  'voiceCast', '{}'::jsonb,
  'summary', '',
  'currentScene', '',
  'characters', '[]'::jsonb,
  'npcs', '[]'::jsonb,
  'locations', '[]'::jsonb,
  'quests', '[]'::jsonb,
  'inventory', '[]'::jsonb,
  'relationships', '[]'::jsonb,
  'worldClock', jsonb_build_object(
    'calendar', jsonb_build_object(
      'id', 'common',
      'name', 'Calendário Comum',
      'months', jsonb_build_array(
        jsonb_build_object('name', 'Janeiro', 'days', 31),
        jsonb_build_object('name', 'Fevereiro', 'days', 28),
        jsonb_build_object('name', 'Março', 'days', 31),
        jsonb_build_object('name', 'Abril', 'days', 30),
        jsonb_build_object('name', 'Maio', 'days', 31),
        jsonb_build_object('name', 'Junho', 'days', 30),
        jsonb_build_object('name', 'Julho', 'days', 31),
        jsonb_build_object('name', 'Agosto', 'days', 31),
        jsonb_build_object('name', 'Setembro', 'days', 30),
        jsonb_build_object('name', 'Outubro', 'days', 31),
        jsonb_build_object('name', 'Novembro', 'days', 30),
        jsonb_build_object('name', 'Dezembro', 'days', 31)
      ),
      'weekdays', jsonb_build_array(
        'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira',
        'Sexta-feira', 'Sábado', 'Domingo'
      ),
      'hoursPerDay', 24,
      'minutesPerHour', 60
    ),
    'region', 'região da campanha',
    'year', 1,
    'month', 1,
    'day', 1,
    'hour', 8,
    'minute', 0,
    'weekdayIndex', 0,
    'elapsedMinutes', 0
  ),
  'flags', '{}'::jsonb
) || state || jsonb_build_object('stateVersion', 1, 'system', system);

create table interactions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns (id) on delete cascade,
  external_id text,
  kind text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  actor_id text,
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index interactions_external_id_unique_idx
on interactions (external_id)
where external_id is not null;

create index interactions_campaign_id_created_at_idx
on interactions (campaign_id, created_at desc);

create table interaction_effects (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references interactions (id) on delete cascade,
  operation_key text not null,
  effect_type text not null,
  effect_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (interaction_id, operation_key)
);

alter table messages
  add column interaction_id uuid references interactions (id) on delete set null,
  add column operation_key text;

alter table dice_rolls
  add column interaction_id uuid references interactions (id) on delete set null,
  add column operation_key text;

alter table events
  add column interaction_id uuid references interactions (id) on delete set null,
  add column operation_key text;

alter table music_requests
  add column interaction_id uuid references interactions (id) on delete set null,
  add column operation_key text,
  add column contract_version integer not null default 1;

update music_requests
set context = jsonb_set(context, '{version}', '1'::jsonb, true)
where not context ? 'version';

update music_requests
set result = jsonb_set(result, '{version}', '1'::jsonb, true)
where status = 'completed' and not result ? 'version';

create unique index messages_interaction_operation_unique_idx
on messages (interaction_id, operation_key)
where interaction_id is not null and operation_key is not null;

create unique index dice_rolls_interaction_operation_unique_idx
on dice_rolls (interaction_id, operation_key)
where interaction_id is not null and operation_key is not null;

create unique index events_interaction_operation_unique_idx
on events (interaction_id, operation_key)
where interaction_id is not null and operation_key is not null;

create unique index music_requests_interaction_operation_unique_idx
on music_requests (interaction_id, operation_key)
where interaction_id is not null and operation_key is not null;

create trigger interactions_set_updated_at
before update on interactions
for each row execute function set_updated_at();
