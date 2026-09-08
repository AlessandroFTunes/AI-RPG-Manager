alter table interactions
  add column attempt_count integer not null default 1,
  add column lease_expires_at timestamptz;

update interactions
set lease_expires_at = updated_at + interval '5 minutes'
where status = 'processing' and lease_expires_at is null;

with duplicate_open_requests as (
  select id
  from (
    select
      id,
      row_number() over (partition by campaign_id order by created_at asc, id asc) as position
    from music_requests
    where status in ('pending', 'processing')
  ) ranked
  where position > 1
)
update music_requests
set
  status = 'cancelled',
  error = 'Cancelled while enforcing one open request per campaign'
where id in (select id from duplicate_open_requests);

create unique index music_requests_one_open_per_campaign_idx
on music_requests (campaign_id)
where status in ('pending', 'processing');
