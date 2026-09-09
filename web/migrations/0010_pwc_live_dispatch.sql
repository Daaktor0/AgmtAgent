-- PWC-24/27: worker discovery for live Proof dispatch. Metadata only.

create or replace function agmt_private.list_active_proof_jobs(limit_count integer default 25)
returns table(run_id text, tenant_id text, owner_user_id text, status text)
language sql
security definer
set search_path = public, agmt_private
as $$
  select run_id, tenant_id, owner_user_id, status
  from public.product_run
  where status in ('scanning', 'queued', 'processing', 'exporting', 'deleting')
  order by updated_at
  limit greatest(1, least(limit_count, 100));
$$;

revoke all on function agmt_private.list_active_proof_jobs(integer) from public;
grant execute on function agmt_private.list_active_proof_jobs(integer) to agmt_worker;
