-- PWC-16: additive metadata and owner-safe lifecycle for temporary Proof runs.
-- Forward-only. No document content, filenames, quotes or raw error text.
-- Does not rewrite 0001–0008. Does not create Matter rows.

-- Existing runs keep original timestamps. authorised_at is copied from
-- upload_started_at so backfill cannot extend retention.

alter table public.product_run
  add column if not exists profile text
    check (profile is null or profile in ('agreement', 'general')),
  add column if not exists language text
    check (language is null or language in ('en-GB', 'en-US')),
  add column if not exists projection_version text,
  add column if not exists index_version text,
  add column if not exists validator_version text,
  add column if not exists coverage_manifest jsonb
    check (
      coverage_manifest is null
      or (
        jsonb_typeof(coverage_manifest) = 'object'
        and not coverage_manifest ? 'filename'
        and not coverage_manifest ? 'quote'
        and not coverage_manifest ? 'bytes'
        and not coverage_manifest ? 'canonical_text'
      )
    ),
  add column if not exists notice_count integer not null default 0
    check (notice_count >= 0),
  add column if not exists lease_token text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists retry_after timestamptz,
  add column if not exists deleted_reason text
    check (deleted_reason is null or deleted_reason in ('manual', 'expiry', 'rejection')),
  add column if not exists deletion_receipt jsonb
    check (
      deletion_receipt is null
      or (
        jsonb_typeof(deletion_receipt) = 'object'
        and not deletion_receipt ? 'filename'
        and not deletion_receipt ? 'quote'
        and not deletion_receipt ? 'bytes'
        and not deletion_receipt ? 'canonical_text'
      )
    ),
  add column if not exists options_digest text
    check (options_digest is null or options_digest ~* '^[0-9a-f]{64}$'),
  add column if not exists scan_receipt jsonb
    check (
      scan_receipt is null
      or (
        jsonb_typeof(scan_receipt) = 'object'
        and scan_receipt ? 'sha256'
        and scan_receipt ? 'byteSize'
        and not scan_receipt ? 'filename'
        and not scan_receipt ? 'quote'
        and not scan_receipt ? 'bytes'
        and not scan_receipt ? 'vendorRaw'
      )
    ),
  add column if not exists authorised_at timestamptz;

update public.product_run
  set authorised_at = upload_started_at
  where authorised_at is null;

alter table public.product_run
  alter column authorised_at set default now(),
  alter column authorised_at set not null;

alter table public.product_run
  drop constraint if exists product_run_tenant_run_owner_key;
alter table public.product_run
  add constraint product_run_tenant_run_owner_key
  unique (tenant_id, run_id, owner_user_id);

create or replace function agmt_private.product_run_deadlines_immutable()
returns trigger
language plpgsql
as $function$
begin
  if new.product_id <> old.product_id
     or new.retention_policy <> old.retention_policy
     or new.upload_started_at <> old.upload_started_at
     or new.retention_deadline <> old.retention_deadline
     or new.access_deadline <> old.access_deadline
     or new.processing_deadline <> old.processing_deadline
     or new.upload_grant_deadline <> old.upload_grant_deadline
     or new.authorised_at <> old.authorised_at then
    raise exception 'product run immutable contract violation';
  end if;
  return new;
end
$function$;

create or replace function agmt_private.product_run_transition_guard()
returns trigger
language plpgsql
as $function$
declare
  allowed boolean := false;
begin
  if new.status = old.status then
    return new;
  end if;
  if old.status = 'uploading' and new.status in ('scanning', 'failed', 'deleting') then
    allowed := true;
  elsif old.status = 'scanning' and new.status in ('queued', 'rejected', 'failed', 'deleting') then
    allowed := true;
  elsif old.status = 'queued' and new.status in ('processing', 'failed', 'deleting') then
    allowed := true;
  elsif old.status = 'processing' and new.status in ('exporting', 'queued', 'failed', 'deleting') then
    allowed := true;
  elsif old.status = 'exporting' and new.status in ('ready', 'queued', 'failed', 'deleting') then
    allowed := true;
  elsif old.status = 'ready' and new.status in ('deleting') then
    allowed := true;
  elsif old.status = 'rejected' and new.status in ('deleting') then
    allowed := true;
  elsif old.status = 'failed' and new.status in ('scanning', 'queued', 'deleting') then
    allowed := true;
  elsif old.status = 'deleting' and new.status in ('deleting', 'deleted') then
    allowed := true;
  elsif old.status = 'deleted' then
    allowed := false;
  end if;
  if not allowed then
    raise exception 'product run invalid state transition: % -> %', old.status, new.status;
  end if;
  return new;
end
$function$;

drop trigger if exists product_run_transition_guard on public.product_run;
create trigger product_run_transition_guard
before update of status on public.product_run
for each row execute function agmt_private.product_run_transition_guard();

alter table public.product_artifact
  add column if not exists attempt_id text not null default '0',
  add column if not exists generation bigint not null default 0
    check (generation >= 0),
  add column if not exists expected_size bigint
    check (expected_size is null or expected_size >= 0),
  add column if not exists provider_etag text,
  add column if not exists write_status text,
  add column if not exists absence_verified_at timestamptz;

update public.product_artifact
  set write_status = 'settled'
  where write_status is null;

alter table public.product_artifact
  alter column write_status set default 'reserved';

alter table public.product_artifact
  alter column write_status set not null;

alter table public.product_artifact
  drop constraint if exists product_artifact_write_status_check;
alter table public.product_artifact
  add constraint product_artifact_write_status_check
  check (write_status in ('reserved', 'writing', 'settled', 'uncertain'));

do $fk$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.product_artifact'::regclass
      and con.contype = 'f'
  loop
    execute format('alter table public.product_artifact drop constraint %I', constraint_name);
  end loop;
end
$fk$;

alter table public.product_artifact
  add constraint product_artifact_run_owner_fkey
  foreign key (tenant_id, run_id, owner_user_id)
  references public.product_run (tenant_id, run_id, owner_user_id);

drop index if exists public.product_artifact_kind_live_idx;

create unique index if not exists product_artifact_generation_attempt_kind_idx
  on public.product_artifact (tenant_id, run_id, generation, attempt_id, kind);

create unique index if not exists product_artifact_one_published_output_idx
  on public.product_artifact (tenant_id, run_id)
  where kind = 'marked_docx' and state = 'published' and write_status = 'settled';

comment on column public.job_outbox.aggregate_type is
  'Known aggregates: ingest_job, upload_intent, product_run. Proof enqueue uses product_run.';

create index if not exists job_outbox_product_run_idx
  on public.job_outbox (tenant_id, aggregate_type, aggregate_id)
  where aggregate_type = 'product_run';
