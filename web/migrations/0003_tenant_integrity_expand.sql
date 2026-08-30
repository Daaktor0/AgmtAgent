-- FND-03 expand phase: introduce tenant identity without rewriting document bytes.
-- This migration is forward-only and intentionally leaves tenant_id nullable until
-- the runtime context and RLS contract migration is deployed and validated.
-- It does not delete rows, rewrite ciphertext, or change object-store state.

create table if not exists agmt_tenant (
  tenant_id text primary key,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now()
);

create table if not exists agmt_tenant_member (
  tenant_id text not null references agmt_tenant (tenant_id),
  user_id text not null references user_account (user_id),
  role text not null default 'owner'
    check (role in ('owner', 'member', 'support')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table review_entitlement add column if not exists tenant_id text;
alter table credit_event add column if not exists tenant_id text;
alter table matter add column if not exists tenant_id text;
alter table mandate_version add column if not exists tenant_id text;
alter table document add column if not exists tenant_id text;
alter table document_version add column if not exists tenant_id text;
alter table object_blob add column if not exists tenant_id text;
alter table canonicalisation_map add column if not exists tenant_id text;
alter table canonicalisation_entry add column if not exists tenant_id text;
alter table canonical_projection add column if not exists tenant_id text;
alter table span_map_segment add column if not exists tenant_id text;
alter table provision add column if not exists tenant_id text;
alter table definition add column if not exists tenant_id text;
alter table definition_use add column if not exists tenant_id text;
alter table deal_map_entry add column if not exists tenant_id text;
alter table source_capability add column if not exists tenant_id text;
alter table proof_run add column if not exists tenant_id text;
alter table proof_check_execution add column if not exists tenant_id text;
alter table proof_hit add column if not exists tenant_id text;
alter table proof_feedback_ticket add column if not exists tenant_id text;
alter table audit_event add column if not exists tenant_id text;
alter table deletion_job add column if not exists tenant_id text;

-- An existing owner has no user_account row: the agmt_tenant foreign key below fails closed at insert time.

with owner_ids(user_id) as (
  select owner_user_id from matter
  union
  select owner_user_id from mandate_version
  union
  select owner_user_id from document
  union
  select owner_user_id from document_version
  union
  select owner_user_id from object_blob
  union
  select owner_user_id from canonicalisation_map
  union
  select owner_user_id from canonicalisation_entry
  union
  select owner_user_id from canonical_projection
  union
  select owner_user_id from span_map_segment
  union
  select owner_user_id from provision
  union
  select owner_user_id from definition
  union
  select owner_user_id from definition_use
  union
  select owner_user_id from deal_map_entry
  union
  select owner_user_id from source_capability
  union
  select owner_user_id from proof_run
  union
  select owner_user_id from proof_check_execution
  union
  select owner_user_id from proof_hit
  union
  select owner_user_id from proof_feedback_ticket
  union
  select owner_user_id from audit_event where owner_user_id is not null
  union
  select owner_user_id from deletion_job
  union
  select user_id from review_entitlement
  union
  select user_id from credit_event
)
insert into agmt_tenant (tenant_id)
select user_id
from owner_ids
where user_id is not null
on conflict (tenant_id) do nothing;

with owner_ids(user_id) as (
  select tenant_id from agmt_tenant
)
insert into agmt_tenant_member (tenant_id, user_id, role)
select user_id, user_id, 'owner'
from owner_ids
on conflict (tenant_id, user_id) do nothing;

update review_entitlement set tenant_id = user_id where tenant_id is null;
update credit_event set tenant_id = user_id where tenant_id is null;
update matter set tenant_id = owner_user_id where tenant_id is null;
update mandate_version set tenant_id = owner_user_id where tenant_id is null;
update document set tenant_id = owner_user_id where tenant_id is null;
update document_version set tenant_id = owner_user_id where tenant_id is null;
update object_blob set tenant_id = owner_user_id where tenant_id is null;
update canonicalisation_map set tenant_id = owner_user_id where tenant_id is null;
update canonicalisation_entry set tenant_id = owner_user_id where tenant_id is null;
update canonical_projection set tenant_id = owner_user_id where tenant_id is null;
update span_map_segment set tenant_id = owner_user_id where tenant_id is null;
update provision set tenant_id = owner_user_id where tenant_id is null;
update definition set tenant_id = owner_user_id where tenant_id is null;
update definition_use set tenant_id = owner_user_id where tenant_id is null;
update deal_map_entry set tenant_id = owner_user_id where tenant_id is null;
update source_capability set tenant_id = owner_user_id where tenant_id is null;
update proof_run set tenant_id = owner_user_id where tenant_id is null;
update proof_check_execution set tenant_id = owner_user_id where tenant_id is null;
update proof_hit set tenant_id = owner_user_id where tenant_id is null;
update proof_feedback_ticket set tenant_id = owner_user_id where tenant_id is null;
update audit_event
set tenant_id = coalesce(owner_user_id, user_id)
where tenant_id is null
  and coalesce(owner_user_id, user_id) is not null;
update deletion_job set tenant_id = owner_user_id where tenant_id is null;

-- These keys are the parent side of tenant-scoped composite foreign keys.
alter table matter add constraint agmt_matter_tenant_id_uq
      unique (tenant_id, matter_id);
alter table mandate_version add constraint agmt_mandate_tenant_id_uq
      unique (tenant_id, mandate_version_id);
alter table document add constraint agmt_document_tenant_id_uq
      unique (tenant_id, document_id);
alter table document_version add constraint agmt_document_version_tenant_id_uq
      unique (tenant_id, document_version_id);
alter table canonicalisation_map add constraint agmt_map_tenant_id_uq
      unique (tenant_id, map_id);
alter table canonical_projection add constraint agmt_projection_tenant_id_uq
      unique (tenant_id, projection_id);
alter table provision add constraint agmt_provision_tenant_id_uq
      unique (tenant_id, provision_id);
alter table definition add constraint agmt_definition_tenant_id_uq
      unique (tenant_id, definition_id);
alter table proof_run add constraint agmt_proof_run_tenant_id_uq
      unique (tenant_id, proof_run_id);
alter table canonicalisation_entry add constraint agmt_entry_tenant_id_uq
      unique (tenant_id, entry_id);
alter table proof_hit add constraint agmt_proof_hit_tenant_id_uq
      unique (tenant_id, proof_hit_id);
create index if not exists review_entitlement_tenant_idx
  on review_entitlement (tenant_id);
create index if not exists credit_event_tenant_idx
  on credit_event (tenant_id);
create index if not exists matter_tenant_idx
  on matter (tenant_id);
create index if not exists mandate_tenant_idx
  on mandate_version (tenant_id);
create index if not exists document_tenant_idx
  on document (tenant_id);
create index if not exists document_version_tenant_idx
  on document_version (tenant_id);
create index if not exists object_blob_tenant_idx
  on object_blob (tenant_id);
create index if not exists canonicalisation_map_tenant_idx
  on canonicalisation_map (tenant_id);
create index if not exists canonicalisation_entry_tenant_idx
  on canonicalisation_entry (tenant_id);
create index if not exists canonical_projection_tenant_idx
  on canonical_projection (tenant_id);
create index if not exists span_map_segment_tenant_idx
  on span_map_segment (tenant_id);
create index if not exists provision_tenant_idx
  on provision (tenant_id);
create index if not exists definition_tenant_idx
  on definition (tenant_id);
create index if not exists definition_use_tenant_idx
  on definition_use (tenant_id);
create index if not exists deal_map_entry_tenant_idx
  on deal_map_entry (tenant_id);
create index if not exists source_capability_tenant_idx
  on source_capability (tenant_id);
create index if not exists proof_run_tenant_idx
  on proof_run (tenant_id);
create index if not exists proof_check_execution_tenant_idx
  on proof_check_execution (tenant_id);
create index if not exists proof_hit_tenant_idx
  on proof_hit (tenant_id);
create index if not exists proof_feedback_ticket_tenant_idx
  on proof_feedback_ticket (tenant_id);
create index if not exists audit_event_tenant_idx
  on audit_event (tenant_id);
create index if not exists deletion_job_tenant_idx
  on deletion_job (tenant_id);

-- NOT VALID preserves a safe expand step: existing rows can be reviewed and
-- validated in a later contract migration, while future non-null values cannot
-- cross a tenant boundary. Nullable tenant_id is deliberately temporary.
alter table review_entitlement add constraint agmt_review_entitlement_member_fk
      foreign key (tenant_id, user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table credit_event add constraint agmt_credit_event_member_fk
      foreign key (tenant_id, user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table matter add constraint agmt_matter_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table mandate_version add constraint agmt_mandate_matter_fk
      foreign key (tenant_id, matter_id)
      references matter (tenant_id, matter_id)
      not valid;
alter table mandate_version add constraint agmt_mandate_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table document add constraint agmt_document_matter_fk
      foreign key (tenant_id, matter_id)
      references matter (tenant_id, matter_id)
      not valid;
alter table document add constraint agmt_document_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table document add constraint agmt_document_current_version_fk
      foreign key (tenant_id, current_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table document_version add constraint agmt_document_version_document_fk
      foreign key (tenant_id, document_id)
      references document (tenant_id, document_id)
      not valid;
alter table document_version add constraint agmt_document_version_matter_fk
      foreign key (tenant_id, matter_id)
      references matter (tenant_id, matter_id)
      not valid;
alter table document_version add constraint agmt_document_version_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table document_version add constraint agmt_document_version_supersedes_fk
      foreign key (tenant_id, supersedes_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table object_blob add constraint agmt_object_blob_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table canonicalisation_map add constraint agmt_map_document_version_fk
      foreign key (tenant_id, document_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table canonicalisation_map add constraint agmt_map_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table canonicalisation_entry add constraint agmt_entry_map_fk
      foreign key (tenant_id, map_id)
      references canonicalisation_map (tenant_id, map_id)
      not valid;
alter table canonicalisation_entry add constraint agmt_entry_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table canonicalisation_entry add constraint agmt_entry_provision_fk
      foreign key (tenant_id, source_provision_id)
      references provision (tenant_id, provision_id)
      not valid;
alter table canonical_projection add constraint agmt_projection_document_version_fk
      foreign key (tenant_id, document_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table canonical_projection add constraint agmt_projection_map_fk
      foreign key (tenant_id, map_id)
      references canonicalisation_map (tenant_id, map_id)
      not valid;
alter table canonical_projection add constraint agmt_projection_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table span_map_segment add constraint agmt_segment_projection_fk
      foreign key (tenant_id, projection_id)
      references canonical_projection (tenant_id, projection_id)
      not valid;
alter table span_map_segment add constraint agmt_segment_provision_fk
      foreign key (tenant_id, provision_id)
      references provision (tenant_id, provision_id)
      not valid;
alter table provision add constraint agmt_provision_document_version_fk
      foreign key (tenant_id, document_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table provision add constraint agmt_provision_projection_fk
      foreign key (tenant_id, projection_id)
      references canonical_projection (tenant_id, projection_id)
      not valid;
alter table provision add constraint agmt_provision_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table provision add constraint agmt_provision_parent_fk
      foreign key (tenant_id, parent_provision_id)
      references provision (tenant_id, provision_id)
      not valid;
alter table definition add constraint agmt_definition_document_fk
      foreign key (tenant_id, document_id)
      references document (tenant_id, document_id)
      not valid;
alter table definition add constraint agmt_definition_document_version_fk
      foreign key (tenant_id, document_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table definition add constraint agmt_definition_projection_fk
      foreign key (tenant_id, projection_id)
      references canonical_projection (tenant_id, projection_id)
      not valid;
alter table definition add constraint agmt_definition_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table definition add constraint agmt_definition_provision_fk
      foreign key (tenant_id, defining_provision_id)
      references provision (tenant_id, provision_id)
      not valid;
alter table definition_use add constraint agmt_definition_use_definition_fk
      foreign key (tenant_id, definition_id)
      references definition (tenant_id, definition_id)
      not valid;
alter table definition_use add constraint agmt_definition_use_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table definition_use add constraint agmt_definition_use_provision_fk
      foreign key (tenant_id, provision_id)
      references provision (tenant_id, provision_id)
      not valid;
alter table deal_map_entry add constraint agmt_deal_document_fk
      foreign key (tenant_id, document_id)
      references document (tenant_id, document_id)
      not valid;
alter table deal_map_entry add constraint agmt_deal_document_version_fk
      foreign key (tenant_id, document_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table deal_map_entry add constraint agmt_deal_projection_fk
      foreign key (tenant_id, projection_id)
      references canonical_projection (tenant_id, projection_id)
      not valid;
alter table deal_map_entry add constraint agmt_deal_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table deal_map_entry add constraint agmt_deal_provision_fk
      foreign key (tenant_id, provision_id)
      references provision (tenant_id, provision_id)
      not valid;
alter table source_capability add constraint agmt_source_capability_document_version_fk
      foreign key (tenant_id, document_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table source_capability add constraint agmt_source_capability_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table proof_run add constraint agmt_proof_run_matter_fk
      foreign key (tenant_id, matter_id)
      references matter (tenant_id, matter_id)
      not valid;
alter table proof_run add constraint agmt_proof_run_document_version_fk
      foreign key (tenant_id, document_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table proof_run add constraint agmt_proof_run_map_fk
      foreign key (tenant_id, map_id)
      references canonicalisation_map (tenant_id, map_id)
      not valid;
alter table proof_run add constraint agmt_proof_run_projection_fk
      foreign key (tenant_id, projection_id)
      references canonical_projection (tenant_id, projection_id)
      not valid;
alter table proof_run add constraint agmt_proof_run_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table proof_check_execution add constraint agmt_check_run_fk
      foreign key (tenant_id, proof_run_id)
      references proof_run (tenant_id, proof_run_id)
      not valid;
alter table proof_check_execution add constraint agmt_check_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table proof_hit add constraint agmt_hit_run_fk
      foreign key (tenant_id, proof_run_id)
      references proof_run (tenant_id, proof_run_id)
      not valid;
alter table proof_hit add constraint agmt_hit_document_version_fk
      foreign key (tenant_id, document_version_id)
      references document_version (tenant_id, document_version_id)
      not valid;
alter table proof_hit add constraint agmt_hit_map_fk
      foreign key (tenant_id, map_id)
      references canonicalisation_map (tenant_id, map_id)
      not valid;
alter table proof_hit add constraint agmt_hit_projection_fk
      foreign key (tenant_id, projection_id)
      references canonical_projection (tenant_id, projection_id)
      not valid;
alter table proof_hit add constraint agmt_hit_provision_fk
      foreign key (tenant_id, provision_id)
      references provision (tenant_id, provision_id)
      not valid;
alter table proof_hit add constraint agmt_hit_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table proof_feedback_ticket add constraint agmt_feedback_hit_fk
      foreign key (tenant_id, proof_hit_id)
      references proof_hit (tenant_id, proof_hit_id)
      not valid;
alter table proof_feedback_ticket add constraint agmt_feedback_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table proof_feedback_ticket add constraint agmt_feedback_user_member_fk
      foreign key (tenant_id, user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table audit_event add constraint agmt_audit_matter_fk
      foreign key (tenant_id, matter_id)
      references matter (tenant_id, matter_id)
      not valid;
alter table audit_event add constraint agmt_audit_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table audit_event add constraint agmt_audit_user_member_fk
      foreign key (tenant_id, user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;
alter table deletion_job add constraint agmt_deletion_matter_fk
      foreign key (tenant_id, matter_id)
      references matter (tenant_id, matter_id)
      not valid;
alter table deletion_job add constraint agmt_deletion_owner_member_fk
      foreign key (tenant_id, owner_user_id)
      references agmt_tenant_member (tenant_id, user_id)
      not valid;

