-- FND-04: tenant isolation through non-login runtime roles and RLS.
--
-- This is a forward-only contract migration. It grants no access to the
-- Supabase client roles and does not rewrite, decrypt, delete, or move data.
-- The application supplies only server-derived settings inside a transaction:
-- agmt.user_id, agmt.tenant_id, agmt.support_ticket and agmt.operation.
--
-- Better Auth uses the separate agmt_auth role for its four identity tables.
-- The application pool must SET ROLE to agmt_app/agmt_worker/agmt_support;
-- those roles are deliberately not login roles and have no bypass capability.

create schema if not exists agmt_private;
revoke all on schema agmt_private from PUBLIC, anon, authenticated;

do $role$
declare
  role_name text;
begin
  for role_name in
    select unnest(array['agmt_app', 'agmt_worker', 'agmt_support', 'agmt_auth'])
  loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'create role %I no login no superuser no createdb no createrole no inherit no replication no bypassrls',
        role_name
      );
    end if;
  end loop;
end
$role$;

do $check$
declare
  invalid_roles text;
begin
  select string_agg(rolname, ', ' order by rolname)
  into invalid_roles
  from pg_roles
  where rolname = any(array['agmt_app', 'agmt_worker', 'agmt_support', 'agmt_auth'])
    and (
      rolcanlogin
      or rolsuper
      or rolcreatedb
      or rolcreaterole
      or rolinherit
      or rolreplication
      or rolbypassrls
    );

  if invalid_roles is not null then
    raise exception 'role attributes are checked; invalid runtime roles: %', invalid_roles;
  end if;
end
$check$;

create or replace function agmt_private.current_user_id()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(current_setting('agmt.user_id', true), '')
$function$;

create or replace function agmt_private.current_tenant_id()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(current_setting('agmt.tenant_id', true), '')
$function$;

create or replace function agmt_private.support_ticket()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(current_setting('agmt.support_ticket', true), '')
$function$;

create or replace function agmt_private.operation()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(current_setting('agmt.operation', true), '')
$function$;

create or replace function agmt_private.can_access_tenant(candidate_tenant_id text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select candidate_tenant_id is not null
     and agmt_private.current_tenant_id() is not null
     and candidate_tenant_id = agmt_private.current_tenant_id()
     and (
       current_user = 'agmt_worker'
       or (
         current_user = 'agmt_support'
         and agmt_private.support_ticket() is not null
       )
       or (
         current_user = 'agmt_app'
         and exists (
           select 1
           from public.agmt_tenant_member member
           where member.tenant_id = candidate_tenant_id
             and member.user_id = agmt_private.current_user_id()
             and member.role in ('owner', 'member')
         )
       )
     )
$function$;

alter table public.review_entitlement enable row level security;
alter table public.review_entitlement force row level security;
revoke all on table public.review_entitlement from PUBLIC, anon, authenticated;
alter table public.credit_event enable row level security;
alter table public.credit_event force row level security;
revoke all on table public.credit_event from PUBLIC, anon, authenticated;
alter table public.matter enable row level security;
alter table public.matter force row level security;
revoke all on table public.matter from PUBLIC, anon, authenticated;
alter table public.mandate_version enable row level security;
alter table public.mandate_version force row level security;
revoke all on table public.mandate_version from PUBLIC, anon, authenticated;
alter table public.document enable row level security;
alter table public.document force row level security;
revoke all on table public.document from PUBLIC, anon, authenticated;
alter table public.document_version enable row level security;
alter table public.document_version force row level security;
revoke all on table public.document_version from PUBLIC, anon, authenticated;
alter table public.object_blob enable row level security;
alter table public.object_blob force row level security;
revoke all on table public.object_blob from PUBLIC, anon, authenticated;
alter table public.canonicalisation_map enable row level security;
alter table public.canonicalisation_map force row level security;
revoke all on table public.canonicalisation_map from PUBLIC, anon, authenticated;
alter table public.canonicalisation_entry enable row level security;
alter table public.canonicalisation_entry force row level security;
revoke all on table public.canonicalisation_entry from PUBLIC, anon, authenticated;
alter table public.canonical_projection enable row level security;
alter table public.canonical_projection force row level security;
revoke all on table public.canonical_projection from PUBLIC, anon, authenticated;
alter table public.span_map_segment enable row level security;
alter table public.span_map_segment force row level security;
revoke all on table public.span_map_segment from PUBLIC, anon, authenticated;
alter table public.provision enable row level security;
alter table public.provision force row level security;
revoke all on table public.provision from PUBLIC, anon, authenticated;
alter table public.definition enable row level security;
alter table public.definition force row level security;
revoke all on table public.definition from PUBLIC, anon, authenticated;
alter table public.definition_use enable row level security;
alter table public.definition_use force row level security;
revoke all on table public.definition_use from PUBLIC, anon, authenticated;
alter table public.deal_map_entry enable row level security;
alter table public.deal_map_entry force row level security;
revoke all on table public.deal_map_entry from PUBLIC, anon, authenticated;
alter table public.source_capability enable row level security;
alter table public.source_capability force row level security;
revoke all on table public.source_capability from PUBLIC, anon, authenticated;
alter table public.proof_run enable row level security;
alter table public.proof_run force row level security;
revoke all on table public.proof_run from PUBLIC, anon, authenticated;
alter table public.proof_check_execution enable row level security;
alter table public.proof_check_execution force row level security;
revoke all on table public.proof_check_execution from PUBLIC, anon, authenticated;
alter table public.proof_hit enable row level security;
alter table public.proof_hit force row level security;
revoke all on table public.proof_hit from PUBLIC, anon, authenticated;
alter table public.proof_feedback_ticket enable row level security;
alter table public.proof_feedback_ticket force row level security;
revoke all on table public.proof_feedback_ticket from PUBLIC, anon, authenticated;
alter table public.audit_event enable row level security;
alter table public.audit_event force row level security;
revoke all on table public.audit_event from PUBLIC, anon, authenticated;
alter table public.deletion_job enable row level security;
alter table public.deletion_job force row level security;
revoke all on table public.deletion_job from PUBLIC, anon, authenticated;
alter table public.agmt_tenant enable row level security;
alter table public.agmt_tenant force row level security;
revoke all on table public.agmt_tenant from PUBLIC, anon, authenticated;
alter table public.agmt_tenant_member enable row level security;
alter table public.agmt_tenant_member force row level security;
revoke all on table public.agmt_tenant_member from PUBLIC, anon, authenticated;
alter table public.user_account enable row level security;
alter table public.user_account force row level security;
revoke all on table public.user_account from PUBLIC, anon, authenticated;
alter table public.magic_link_token enable row level security;
alter table public.magic_link_token force row level security;
revoke all on table public.magic_link_token from PUBLIC, anon, authenticated;
alter table public.app_config enable row level security;
alter table public.app_config force row level security;
revoke all on table public.app_config from PUBLIC, anon, authenticated;
alter table public._migrations enable row level security;
alter table public._migrations force row level security;
revoke all on table public._migrations from PUBLIC, anon, authenticated;
alter table public."user" enable row level security;
alter table public."user" force row level security;
revoke all on table public."user" from PUBLIC, anon, authenticated;
alter table public."session" enable row level security;
alter table public."session" force row level security;
revoke all on table public."session" from PUBLIC, anon, authenticated;
alter table public."account" enable row level security;
alter table public."account" force row level security;
revoke all on table public."account" from PUBLIC, anon, authenticated;
alter table public."verification" enable row level security;
alter table public."verification" force row level security;
revoke all on table public."verification" from PUBLIC, anon, authenticated;

grant usage on schema public to agmt_app, agmt_worker, agmt_support, agmt_auth;
grant usage on schema agmt_private to agmt_app, agmt_worker, agmt_support, agmt_auth;
grant execute on all functions in schema agmt_private to agmt_app, agmt_worker, agmt_support, agmt_auth;

grant select, insert, update, delete on table public.agmt_tenant,
  public.agmt_tenant_member to agmt_app, agmt_worker;
grant select on table public.agmt_tenant,
  public.agmt_tenant_member to agmt_support;

grant select, insert, update, delete on table public.user_account to agmt_app, agmt_worker;
grant select on table public.user_account to agmt_support;

grant select, insert, update, delete on table public.magic_link_token to agmt_app;
grant select on table public.app_config to agmt_app, agmt_worker;

grant select, insert, update, delete on table
  public.review_entitlement,
  public.credit_event,
  public.matter,
  public.mandate_version,
  public.document,
  public.document_version,
  public.object_blob,
  public.canonicalisation_map,
  public.canonicalisation_entry,
  public.canonical_projection,
  public.span_map_segment,
  public.provision,
  public.definition,
  public.definition_use,
  public.deal_map_entry,
  public.source_capability,
  public.proof_run,
  public.proof_check_execution,
  public.proof_hit,
  public.proof_feedback_ticket,
  public.audit_event,
  public.deletion_job
to agmt_app, agmt_worker;
grant select on table
  public.review_entitlement,
  public.credit_event,
  public.matter,
  public.mandate_version,
  public.document,
  public.document_version,
  public.object_blob,
  public.canonicalisation_map,
  public.canonicalisation_entry,
  public.canonical_projection,
  public.span_map_segment,
  public.provision,
  public.definition,
  public.definition_use,
  public.deal_map_entry,
  public.source_capability,
  public.proof_run,
  public.proof_check_execution,
  public.proof_hit,
  public.proof_feedback_ticket,
  public.audit_event,
  public.deletion_job
to agmt_support;

grant select, insert, update, delete on table
  public."user",
  public."session",
  public."account",
  public."verification"
to agmt_auth;

create policy agmt_tenant_app_select
  on public.agmt_tenant for select to agmt_app
  using (
    tenant_id = agmt_private.current_tenant_id()
    or exists (
      select 1
      from public.agmt_tenant_member member
      where member.tenant_id = agmt_tenant.tenant_id
        and member.user_id = agmt_private.current_user_id()
        and member.role in ('owner', 'member')
    )
  );

create policy agmt_tenant_app_insert
  on public.agmt_tenant for insert to agmt_app
  with check (
    tenant_id = agmt_private.current_user_id()
    and tenant_id = agmt_private.current_tenant_id()
    and status = 'active'
  );

create policy agmt_tenant_worker_all
  on public.agmt_tenant for all to agmt_worker
  using (
    current_tenant_id() is not null
    and tenant_id = agmt_private.current_tenant_id()
  )
  with check (
    current_tenant_id() is not null
    and tenant_id = agmt_private.current_tenant_id()
  );

create policy agmt_tenant_support_select
  on public.agmt_tenant for select to agmt_support
  using (
    current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and tenant_id = agmt_private.current_tenant_id()
  );

create policy agmt_tenant_member_app_select
  on public.agmt_tenant_member for select to agmt_app
  using (
    user_id = agmt_private.current_user_id()
    or tenant_id = agmt_private.current_tenant_id()
  );

create policy agmt_tenant_member_app_insert
  on public.agmt_tenant_member for insert to agmt_app
  with check (
    tenant_id = agmt_private.current_tenant_id()
    and tenant_id = agmt_private.current_user_id()
    and user_id = agmt_private.current_user_id()
    and role = 'owner'
  );

create policy agmt_tenant_member_worker_all
  on public.agmt_tenant_member for all to agmt_worker
  using (
    current_tenant_id() is not null
    and tenant_id = agmt_private.current_tenant_id()
  )
  with check (
    current_tenant_id() is not null
    and tenant_id = agmt_private.current_tenant_id()
  );

create policy agmt_tenant_member_support_select
  on public.agmt_tenant_member for select to agmt_support
  using (
    current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and tenant_id = agmt_private.current_tenant_id()
  );

create policy user_account_app_select
  on public.user_account for select to agmt_app
  using (user_id = agmt_private.current_user_id());

create policy user_account_app_write
  on public.user_account for all to agmt_app
  using (user_id = agmt_private.current_user_id())
  with check (user_id = agmt_private.current_user_id());

create policy user_account_worker_all
  on public.user_account for all to agmt_worker
  using (
    current_tenant_id() is not null
    and exists (
      select 1
      from public.agmt_tenant_member member
      where member.tenant_id = agmt_private.current_tenant_id()
        and member.user_id = user_account.user_id
    )
  )
  with check (
    current_tenant_id() is not null
    and exists (
      select 1
      from public.agmt_tenant_member member
      where member.tenant_id = agmt_private.current_tenant_id()
        and member.user_id = user_account.user_id
    )
  );

create policy user_account_support_select
  on public.user_account for select to agmt_support
  using (
    current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and exists (
      select 1
      from public.agmt_tenant_member member
      where member.tenant_id = agmt_private.current_tenant_id()
        and member.user_id = user_account.user_id
    )
  );

create policy magic_link_token_app_auth_all
  on public.magic_link_token for all to agmt_app
  using (
    current_user = 'agmt_app'
    and agmt_private.operation() in ('auth_magic_link_request', 'auth_magic_link_verify')
  )
  with check (
    current_user = 'agmt_app'
    and agmt_private.operation() in ('auth_magic_link_request', 'auth_magic_link_verify')
  );

create policy app_config_app_select
  on public.app_config for select to agmt_app
  using (current_user = 'agmt_app');

create policy app_config_worker_select
  on public.app_config for select to agmt_worker
  using (current_user = 'agmt_worker');

create policy auth_user_all
  on public."user" for all to agmt_auth
  using (true)
  with check (true);

create policy auth_session_all
  on public."session" for all to agmt_auth
  using (true)
  with check (true);

create policy auth_account_all
  on public."account" for all to agmt_auth
  using (true)
  with check (true);

create policy auth_verification_all
  on public."verification" for all to agmt_auth
  using (true)
  with check (true);

create policy review_entitlement_app_select
  on public.review_entitlement for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and user_id = agmt_private.current_user_id()
  );

create policy review_entitlement_app_write
  on public.review_entitlement for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and user_id = agmt_private.current_user_id()
  );

create policy review_entitlement_worker_all
  on public.review_entitlement for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy review_entitlement_support_select
  on public.review_entitlement for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy credit_event_app_select
  on public.credit_event for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and user_id = agmt_private.current_user_id()
  );

create policy credit_event_app_write
  on public.credit_event for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and user_id = agmt_private.current_user_id()
  );

create policy credit_event_worker_all
  on public.credit_event for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy credit_event_support_select
  on public.credit_event for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy matter_app_select
  on public.matter for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy matter_app_write
  on public.matter for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy matter_worker_all
  on public.matter for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy matter_support_select
  on public.matter for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy mandate_version_app_select
  on public.mandate_version for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy mandate_version_app_write
  on public.mandate_version for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy mandate_version_worker_all
  on public.mandate_version for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy mandate_version_support_select
  on public.mandate_version for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy document_app_select
  on public.document for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy document_app_write
  on public.document for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy document_worker_all
  on public.document for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy document_support_select
  on public.document for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy document_version_app_select
  on public.document_version for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy document_version_app_write
  on public.document_version for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy document_version_worker_all
  on public.document_version for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy document_version_support_select
  on public.document_version for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy object_blob_app_select
  on public.object_blob for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy object_blob_app_write
  on public.object_blob for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy object_blob_worker_all
  on public.object_blob for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy object_blob_support_select
  on public.object_blob for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy canonicalisation_map_app_select
  on public.canonicalisation_map for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy canonicalisation_map_app_write
  on public.canonicalisation_map for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy canonicalisation_map_worker_all
  on public.canonicalisation_map for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy canonicalisation_map_support_select
  on public.canonicalisation_map for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy canonicalisation_entry_app_select
  on public.canonicalisation_entry for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy canonicalisation_entry_app_write
  on public.canonicalisation_entry for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy canonicalisation_entry_worker_all
  on public.canonicalisation_entry for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy canonicalisation_entry_support_select
  on public.canonicalisation_entry for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy canonical_projection_app_select
  on public.canonical_projection for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy canonical_projection_app_write
  on public.canonical_projection for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy canonical_projection_worker_all
  on public.canonical_projection for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy canonical_projection_support_select
  on public.canonical_projection for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy span_map_segment_app_select
  on public.span_map_segment for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy span_map_segment_app_write
  on public.span_map_segment for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy span_map_segment_worker_all
  on public.span_map_segment for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy span_map_segment_support_select
  on public.span_map_segment for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy provision_app_select
  on public.provision for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy provision_app_write
  on public.provision for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy provision_worker_all
  on public.provision for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy provision_support_select
  on public.provision for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy definition_app_select
  on public.definition for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy definition_app_write
  on public.definition for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy definition_worker_all
  on public.definition for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy definition_support_select
  on public.definition for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy definition_use_app_select
  on public.definition_use for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy definition_use_app_write
  on public.definition_use for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy definition_use_worker_all
  on public.definition_use for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy definition_use_support_select
  on public.definition_use for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy deal_map_entry_app_select
  on public.deal_map_entry for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy deal_map_entry_app_write
  on public.deal_map_entry for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy deal_map_entry_worker_all
  on public.deal_map_entry for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy deal_map_entry_support_select
  on public.deal_map_entry for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy source_capability_app_select
  on public.source_capability for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy source_capability_app_write
  on public.source_capability for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy source_capability_worker_all
  on public.source_capability for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy source_capability_support_select
  on public.source_capability for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy proof_run_app_select
  on public.proof_run for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy proof_run_app_write
  on public.proof_run for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy proof_run_worker_all
  on public.proof_run for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy proof_run_support_select
  on public.proof_run for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy proof_check_execution_app_select
  on public.proof_check_execution for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy proof_check_execution_app_write
  on public.proof_check_execution for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy proof_check_execution_worker_all
  on public.proof_check_execution for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy proof_check_execution_support_select
  on public.proof_check_execution for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy proof_hit_app_select
  on public.proof_hit for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy proof_hit_app_write
  on public.proof_hit for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy proof_hit_worker_all
  on public.proof_hit for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy proof_hit_support_select
  on public.proof_hit for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy proof_feedback_ticket_app_select
  on public.proof_feedback_ticket for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy proof_feedback_ticket_app_write
  on public.proof_feedback_ticket for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy proof_feedback_ticket_worker_all
  on public.proof_feedback_ticket for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy proof_feedback_ticket_support_select
  on public.proof_feedback_ticket for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy audit_event_app_select
  on public.audit_event for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy audit_event_app_write
  on public.audit_event for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and coalesce(owner_user_id, user_id) = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and coalesce(owner_user_id, user_id) = agmt_private.current_user_id()
  );

create policy audit_event_worker_all
  on public.audit_event for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy audit_event_support_select
  on public.audit_event for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy deletion_job_app_select
  on public.deletion_job for select to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    
  );

create policy deletion_job_app_write
  on public.deletion_job for all to agmt_app
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
    and owner_user_id = agmt_private.current_user_id()
  );

create policy deletion_job_worker_all
  on public.deletion_job for all to agmt_worker
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  )
  with check (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy deletion_job_support_select
  on public.deletion_job for select to agmt_support
  using (
    tenant_id is not null
    and agmt_private.current_tenant_id() is not null
    and agmt_private.support_ticket() is not null
    and agmt_private.can_access_tenant(tenant_id)
  );

create policy audit_event_auth_insert
  on public.audit_event for insert to agmt_app
  with check (
    tenant_id is null
    and owner_user_id is null
    and user_id is null
    and action like 'auth.%'
    and agmt_private.operation() in ('auth_magic_link_request', 'auth_magic_link_verify')
  );
