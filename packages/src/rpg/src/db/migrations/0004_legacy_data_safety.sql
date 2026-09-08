with campaign_extensions as (
  select
    id,
    state - array[
      'stateVersion', 'system', 'ruleset', 'phase', 'setup', 'voice', 'voiceCast',
      'summary', 'currentScene', 'characters', 'npcs', 'locations', 'quests',
      'inventory', 'relationships', 'worldClock', 'flags'
    ]::text[] as legacy_state
  from campaigns
)
update campaigns as campaign
set state = case
  when extension.legacy_state = '{}'::jsonb then campaign.state
  else jsonb_set(
    campaign.state - array(select jsonb_object_keys(extension.legacy_state)),
    '{flags}',
    coalesce(campaign.state -> 'flags', '{}'::jsonb)
      || jsonb_build_object('legacyState', extension.legacy_state),
    true
  )
end
from campaign_extensions as extension
where campaign.id = extension.id;

update music_requests
set
  status = 'failed',
  error = 'Legacy music request does not satisfy contract version 1',
  processed_at = coalesce(processed_at, now())
where status in ('pending', 'processing')
  and not (
    jsonb_typeof(context) = 'object'
    and context ->> 'version' = '1'
    and jsonb_typeof(context -> 'campaign') = 'object'
    and jsonb_typeof(context -> 'request') = 'object'
    and jsonb_typeof(context -> 'recentMessages') = 'array'
  );
