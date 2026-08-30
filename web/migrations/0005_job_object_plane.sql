-- JOB-01 / OBJ-01: additive durable upload, job, outbox and object metadata plane.
--
-- This migration never copies, decrypts, deletes, or rewrites legacy object bytes.
-- object_blob remains legacy until a separately reviewed historical migration.
-- New object bytes are written through the server-only ObjectStore abstraction.
-- Handler idempotency is ON CONFLICT (tenant_id, idempotency_key); worker leasing
-- is FOR UPDATE SKIP LOCKED with a bounded lease token and expiry.

create table if not exists public.object_manifest (
  object_key text primary key,
  tenant_id text not null,
  owner_user_id text not null,
  kind text not null,
  storage_provider text not null
    check (storage_provider in ('s3', 'memory')),
  storage_key text not null unique,
  state text not null default 'staged'
    check (state in ('staged', 'clean', 'quarantined', 'deleted')),
  content_type text not null default 'application/octet-stream',
  sha256 text not null
    check (sha256 ~ '^[0-9a-f]{64}$'),
  ciphertext_sha256 text not null
    check (ciphertext_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size >= 0),
  ciphertext_byte_size bigint not null check (ciphertext_byte_size >= 0),
  wrapped_data_key text not null,
  cipher_metadata jsonb not null,
  created_at timestamptz not null default now(),
  clean_at timestamptz,
  deleted_at timestamptz,
  foreign key (tenant_id, owner_user_id)
    references public.agmt_tenant_member (tenant_id, user_id)
);

create index if not exists object_manifest_tenant_state_idx
  on public.object_manifest (tenant_id, state);
create index if not exists object_manifest_owner_idx
  on public.object_manifest (tenant_id, owner_user_id);

create table if not exists public.upload_intent (
  upload_intent_id text primary key,
  tenant_id text not null,
  owner_user_id text not null,
  matter_id text not null,
  object_key text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  sha256 text not null
    check (sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null,
  status text not null default 'created'
    check (status in (
      'created', 'uploading', 'uploaded', 'scan_pending', 'clean',
      'rejected', 'expired', 'aborted', 'consumed'
    )),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  uploaded_at timestamptz,
  scan_started_at timestamptz,
  malware_verdict text,
  rejection_code text,
  consumed_at timestamptz,
  unique (tenant_id, idempotency_key),
  unique (tenant_id, upload_intent_id),
  unique (tenant_id, object_key),
  foreign key (tenant_id, owner_user_id)
    references public.agmt_tenant_member (tenant_id, user_id),
  foreign key (tenant_id, matter_id)
    references public.matter (tenant_id, matter_id)
);

create index if not exists upload_intent_expiry_idx
  on public.upload_intent (status, expires_at);
create index if not exists upload_intent_tenant_state_idx
  on public.upload_intent (tenant_id, status, updated_at);

create table if not exists public.ingest_job (
  job_id text primary key,
  tenant_id text not null,
  owner_user_id text not null,
  upload_intent_id text not null,
  object_key text not null,
  source_sha256 text not null
    check (source_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version text not null,
  idempotency_key text not null,
  status text not null default 'queued'
    check (status in (
      'queued', 'leased', 'succeeded', 'retryable_failed',
      'dead_letter', 'cancelled'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_token text,
  lease_owner text,
  lease_expires_at timestamptz,
  available_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, owner_user_id)
    references public.agmt_tenant_member (tenant_id, user_id),
  foreign key (tenant_id, upload_intent_id)
    references public.upload_intent (tenant_id, upload_intent_id)
);

create index if not exists ingest_job_claim_idx
  on public.ingest_job (tenant_id, status, available_at, lease_expires_at);
create index if not exists ingest_job_owner_idx
  on public.ingest_job (tenant_id, owner_user_id);

create table if not exists public.job_outbox (
  outbox_id text primary key,
  tenant_id text not null,
  created_by_user_id text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  job_type text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'leased', 'published', 'failed', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_token text,
  lease_owner text,
  lease_expires_at timestamptz,
  available_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (tenant_id, job_type, idempotency_key),
  foreign key (tenant_id, created_by_user_id)
    references public.agmt_tenant_member (tenant_id, user_id)
);

create index if not exists job_outbox_claim_idx
  on public.job_outbox (tenant_id, status, available_at, lease_expires_at);
create index if not exists job_outbox_aggregate_idx
  on public.job_outbox (tenant_id, aggregate_type, aggregate_id);

-- The four new tables were created after 0004, so they must receive the same
-- deny-by-default contract explicitly. The conditional client-role revoke keeps
-- the migration runnable in PGlite while protecting Supabase client roles.
do $acl$
declare
  role_name text;
begin
  revoke all on table
    public.object_manifest,
    public.upload_intent,
    public.ingest_job,
    public.job_outbox
    from public;
  for role_name in
    select unnest(array['anon', 'authenticated'])
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table public.object_manifest, public.upload_intent, public.ingest_job, public.job_outbox from %I',
        role_name
      );
    end if;
  end loop;
end
$acl$;

grant select, insert, update, delete on table public.object_manifest to agmt_app;
grant select, insert, update, delete on table public.object_manifest to agmt_worker;
grant select on table public.object_manifest to agmt_support;

grant select, insert, update, delete on table public.upload_intent to agmt_app;
grant select, insert, update, delete on table public.upload_intent to agmt_worker;
grant select on table public.upload_intent to agmt_support;

grant select, insert on table public.ingest_job to agmt_app;
grant select, insert, update, delete on table public.ingest_job to agmt_worker;
grant select on table public.ingest_job to agmt_support;

grant select, insert on table public.job_outbox to agmt_app;
grant select, insert, update, delete on table public.job_outbox to agmt_worker;
grant select on table public.job_outbox to agmt_support;

alter table public.object_manifest enable row level security;
alter table public.object_manifest force row level security;
alter table public.upload_intent enable row level security;
alter table public.upload_intent force row level security;
alter table public.ingest_job enable row level security;
alter table public.ingest_job force row level security;
alter table public.job_outbox enable row level security;
alter table public.job_outbox force row level security;

create policy object_manifest_app_select
  on public.object_manifest for select to agmt_app
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy object_manifest_app_write
  on public.object_manifest for all to agmt_app
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy object_manifest_worker_all
  on public.object_manifest for all to agmt_worker
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy object_manifest_support_select
  on public.object_manifest for select to agmt_support
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy upload_intent_app_select
  on public.upload_intent for select to agmt_app
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy upload_intent_app_write
  on public.upload_intent for all to agmt_app
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy upload_intent_worker_all
  on public.upload_intent for all to agmt_worker
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy upload_intent_support_select
  on public.upload_intent for select to agmt_support
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy ingest_job_app_select
  on public.ingest_job for select to agmt_app
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy ingest_job_app_enqueue
  on public.ingest_job for insert to agmt_app
  with check (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
    and status = 'queued'
    and attempt_count = 0
    and lease_token is null
  );

create policy ingest_job_worker_all
  on public.ingest_job for all to agmt_worker
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy ingest_job_support_select
  on public.ingest_job for select to agmt_support
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy job_outbox_app_select
  on public.job_outbox for select to agmt_app
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and created_by_user_id = agmt_private.current_user_id()
  );

create policy job_outbox_app_enqueue
  on public.job_outbox for insert to agmt_app
  with check (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
    and created_by_user_id = agmt_private.current_user_id()
    and status = 'pending'
    and attempt_count = 0
    and lease_token is null
  );

create policy job_outbox_worker_all
  on public.job_outbox for all to agmt_worker
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy job_outbox_support_select
  on public.job_outbox for select to agmt_support
  using (
    tenant_id = agmt_private.current_tenant_id()
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

-- Auth request audit is tenantless by design: the email address is not yet a
-- verified application identity. It is still narrowly operation-scoped.
create policy audit_event_app_auth_insert
  on public.audit_event for insert to agmt_app
  with check (
    tenant_id is null
    and owner_user_id is null
    and user_id is null
    and agmt_private.current_tenant_id() is null
    and agmt_private.operation() = 'auth_magic_link_request'
    and action = 'auth.magic_link_request'
  );
