-- T07 / R2-02: maintenance discovery for the scheduled purge worker.
-- The function returns metadata only. Provider deletion still occurs through
-- the server-only object store under a tenant-scoped worker context.

create or replace function agmt_private.list_due_product_runs(limit_count integer default 25)
returns table(run_id text, tenant_id text, owner_user_id text)
language sql
security definer
set search_path = public, agmt_private
as $$
  select run_id, tenant_id, owner_user_id
  from public.product_run
  where status <> 'deleted'
    and access_deadline <= now()
  order by access_deadline, created_at
  limit greatest(1, least(limit_count, 100));
$$;

revoke all on function agmt_private.list_due_product_runs(integer) from public;
grant execute on function agmt_private.list_due_product_runs(integer) to agmt_worker;
