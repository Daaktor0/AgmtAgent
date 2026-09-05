-- T06 / Proof-01: additive metadata plane for the temporary Proof product.
--
-- These tables deliberately contain no document text or source bytes.
-- Bytes remain in the
-- server-only object store and are referenced only by opaque storage keys.
-- This migration is forward-only and does not alter any legacy table.

create table if not exists public.product_run (
  run_id text primary key,
  tenant_id text not null,
  owner_user_id text not null,
  product_id text not null check (product_id = 'proof'),
  retention_policy text not null default 'temporary_2h'
    check (retention_policy = 'temporary_2h'),
  status text not null default 'uploading'
    check (status in ('uploading','scanning','queued','processing','exporting',
      'ready','rejected','failed','deleting','deleted')),
  upload_started_at timestamptz not null,
  retention_deadline timestamptz not null,
  access_deadline timestamptz not null,
  processing_deadline timestamptz not null,
  upload_grant_deadline timestamptz not null,
  cancellation_generation bigint not null default 0
    check (cancellation_generation >= 0),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  parser_version text not null,
  rule_set_version text not null,
  exporter_version text not null,
  idempotency_key text not null,
  source_size bigint check (source_size is null or source_size between 1 and 26214400),
  source_sha256 text check (source_sha256 is null or source_sha256 ~* '^[0-9a-f]{64}$'),
  output_artifact_id text,
  correction_count integer not null default 0 check (correction_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  coverage_status text check (coverage_status is null or coverage_status in ('complete','limited')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deletion_verified_at timestamptz,
  unique (tenant_id, run_id),
  unique (tenant_id, owner_user_id, product_id, idempotency_key),
  foreign key (tenant_id, owner_user_id)
    references public.agmt_tenant_member (tenant_id, user_id),
  check (retention_deadline = upload_started_at + interval '2 hours'),
  check (access_deadline = retention_deadline - interval '5 minutes'),
  check (processing_deadline = retention_deadline - interval '10 minutes'),
  check (upload_grant_deadline = least(upload_started_at + interval '15 minutes', processing_deadline)),
  check (processing_deadline > upload_started_at),
  check ((status = 'deleted') = (deleted_at is not null)),
  check (deletion_verified_at is null or status = 'deleted')
);

create index if not exists product_run_tenant_status_idx
  on public.product_run (tenant_id, status, retention_deadline);
create index if not exists product_run_purge_idx
  on public.product_run (status, access_deadline);

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
     or new.upload_grant_deadline <> old.upload_grant_deadline then
    raise exception 'product run immutable contract violation';
  end if;
  return new;
end
$function$;

create trigger product_run_deadlines_immutable
before update on public.product_run
for each row execute function agmt_private.product_run_deadlines_immutable();

create table if not exists public.product_artifact (
  artifact_id text primary key,
  run_id text not null,
  tenant_id text not null,
  owner_user_id text not null,
  kind text not null check (kind in ('source','analysis','export_plan','marked_docx')),
  storage_key text not null,
  state text not null default 'staged'
    check (state in ('staged','published','deleting','deleted')),
  content_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~* '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  foreign key (tenant_id, run_id)
    references public.product_run (tenant_id, run_id),
  foreign key (tenant_id, owner_user_id)
    references public.agmt_tenant_member (tenant_id, user_id),
  check ((state = 'deleted') = (deleted_at is not null))
);

create index if not exists product_artifact_run_idx
  on public.product_artifact (tenant_id, run_id, state);
create unique index if not exists product_artifact_kind_live_idx
  on public.product_artifact (tenant_id, run_id, kind)
  where state <> 'deleted';

do $acl$
declare
  role_name text;
begin
  revoke all on table public.product_run, public.product_artifact from public;
  for role_name in select unnest(array['anon', 'authenticated']) loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table public.product_run, public.product_artifact from %I', role_name);
    end if;
  end loop;
end
$acl$;

grant select, insert, update, delete on table public.product_run to agmt_app, agmt_worker;
grant select on table public.product_run to agmt_support;
grant select, insert, update, delete on table public.product_artifact to agmt_app, agmt_worker;
grant select on table public.product_artifact to agmt_support;

alter table public.product_run enable row level security;
alter table public.product_run force row level security;
alter table public.product_artifact enable row level security;
alter table public.product_artifact force row level security;

create policy product_run_app_select on public.product_run for select to agmt_app
  using (agmt_private.can_access_tenant(tenant_id) and owner_user_id = agmt_private.current_user_id());
create policy product_run_app_write on public.product_run for all to agmt_app
  using (agmt_private.can_access_tenant(tenant_id) and owner_user_id = agmt_private.current_user_id())
  with check (agmt_private.can_access_tenant(tenant_id) and owner_user_id = agmt_private.current_user_id());
create policy product_run_worker_all on public.product_run for all to agmt_worker
  using (agmt_private.can_access_tenant(tenant_id))
  with check (agmt_private.can_access_tenant(tenant_id));
create policy product_run_support_select on public.product_run for select to agmt_support
  using (agmt_private.can_access_tenant(tenant_id) and agmt_private.support_ticket() is not null);

create policy product_artifact_app_select on public.product_artifact for select to agmt_app
  using (agmt_private.can_access_tenant(tenant_id) and owner_user_id = agmt_private.current_user_id());
create policy product_artifact_app_write on public.product_artifact for all to agmt_app
  using (agmt_private.can_access_tenant(tenant_id) and owner_user_id = agmt_private.current_user_id())
  with check (agmt_private.can_access_tenant(tenant_id) and owner_user_id = agmt_private.current_user_id());
create policy product_artifact_worker_all on public.product_artifact for all to agmt_worker
  using (agmt_private.can_access_tenant(tenant_id))
  with check (agmt_private.can_access_tenant(tenant_id));
create policy product_artifact_support_select on public.product_artifact for select to agmt_support
  using (agmt_private.can_access_tenant(tenant_id) and agmt_private.support_ticket() is not null);
