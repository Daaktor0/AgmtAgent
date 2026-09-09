-- PWC-21: metadata-only global Proof quota snapshot for conservative admission.
-- Counts runs, never document bytes or names. Not applied to production in this
-- change; rehearsed locally with other PWC migrations.

create or replace function agmt_private.proof_quota_snapshot(
  p_tenant_id text,
  p_owner_user_id text,
  p_now timestamptz default now()
)
returns table(
  owner_active_processing integer,
  owner_active_runs integer,
  owner_uploads_utc_day integer,
  global_uploads_utc_day integer,
  global_uploads_utc_month integer,
  global_compute_attempts integer
)
language sql
stable
security definer
set search_path = public, agmt_private
as $$
  select
    (
      select count(*)::integer
      from public.product_run
      where tenant_id = p_tenant_id
        and owner_user_id = p_owner_user_id
        and status in ('processing', 'exporting')
    ) as owner_active_processing,
    (
      select count(*)::integer
      from public.product_run
      where tenant_id = p_tenant_id
        and owner_user_id = p_owner_user_id
        and status in ('uploading', 'scanning', 'queued', 'processing', 'exporting', 'ready')
    ) as owner_active_runs,
    (
      select count(*)::integer
      from public.product_run
      where tenant_id = p_tenant_id
        and owner_user_id = p_owner_user_id
        and upload_started_at >= date_trunc('day', p_now at time zone 'utc') at time zone 'utc'
    ) as owner_uploads_utc_day,
    (
      select count(*)::integer
      from public.product_run
      where upload_started_at >= date_trunc('day', p_now at time zone 'utc') at time zone 'utc'
    ) as global_uploads_utc_day,
    (
      select count(*)::integer
      from public.product_run
      where upload_started_at >= date_trunc('month', p_now at time zone 'utc') at time zone 'utc'
    ) as global_uploads_utc_month,
    (
      select count(*)::integer
      from public.product_run
      where status in ('processing', 'exporting', 'scanning', 'queued')
    ) as global_compute_attempts;
$$;

revoke all on function agmt_private.proof_quota_snapshot(text, text, timestamptz) from public;
grant execute on function agmt_private.proof_quota_snapshot(text, text, timestamptz) to agmt_worker;
grant execute on function agmt_private.proof_quota_snapshot(text, text, timestamptz) to agmt_app;
