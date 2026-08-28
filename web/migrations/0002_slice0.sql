-- Slice 0 DATA-MODEL tables. owner_user_id is TEXT (Better Auth id).
-- IDs for Agmt objects are UUID text generated in application code.

create table if not exists user_account (
  user_id text primary key,
  email_normalised text unique,
  email_verified_at timestamptz,
  display_name text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists magic_link_token (
  token_id text primary key,
  email_normalised text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  request_ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists magic_link_email_idx on magic_link_token (email_normalised, created_at);

create table if not exists review_entitlement (
  user_id text primary key references user_account (user_id),
  review_enabled boolean not null default false,
  extra_run_credits integer not null default 0,
  stronger_override_credits integer not null default 0
);

create table if not exists credit_event (
  credit_event_id text primary key,
  user_id text not null,
  review_run_id text,
  kind text not null,
  delta integer not null,
  reason_code text not null,
  external_ref text,
  created_at timestamptz not null default now()
);

create table if not exists matter (
  matter_id text primary key,
  owner_user_id text not null,
  name text not null,
  status text not null default 'active',
  active_mandate_version_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists matter_owner_idx on matter (owner_user_id);

create table if not exists mandate_version (
  mandate_version_id text primary key,
  matter_id text not null,
  owner_user_id text not null,
  version_no integer not null,
  represented_party text not null,
  instruments jsonb not null,
  stage text not null,
  must_protect_notes_ciphertext text,
  canonical_notes text,
  mandate_hash text not null,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  unique (matter_id, version_no)
);
create index if not exists mandate_owner_idx on mandate_version (owner_user_id);
create index if not exists mandate_matter_idx on mandate_version (matter_id);

create table if not exists document (
  document_id text primary key,
  matter_id text not null,
  owner_user_id text not null,
  logical_name text not null,
  role text not null,
  user_instrument text not null default 'unknown',
  detected_instrument text not null default 'unknown',
  current_version_id text,
  created_at timestamptz not null default now()
);
create index if not exists document_owner_idx on document (owner_user_id);
create index if not exists document_matter_idx on document (matter_id);

create table if not exists document_version (
  document_version_id text primary key,
  document_id text not null,
  matter_id text not null,
  owner_user_id text not null,
  version_no integer not null,
  supersedes_version_id text,
  source_sha256 text not null,
  mime_type text not null,
  byte_size integer not null,
  page_count integer not null default 0,
  page_count_method text not null default 'estimated',
  original_object_key text,
  wrapped_data_key text,
  cipher_metadata jsonb,
  ingest_status text not null,
  refusal_code text,
  source_quality text not null default 'unreadable',
  structure_confidence numeric,
  index_quality_version text,
  ingest_schema_version text not null,
  created_at timestamptz not null default now(),
  unique (document_id, source_sha256),
  unique (document_id, version_no)
);
create index if not exists document_version_owner_idx on document_version (owner_user_id);

create table if not exists object_blob (
  object_key text primary key,
  owner_user_id text not null,
  kind text not null,
  wrapped_data_key text not null,
  cipher_metadata jsonb not null,
  ciphertext text not null,
  sha256 text not null,
  byte_size integer not null,
  created_at timestamptz not null default now()
);
create index if not exists object_blob_owner_idx on object_blob (owner_user_id);

create table if not exists canonicalisation_map (
  map_id text primary key,
  document_version_id text not null,
  owner_user_id text not null,
  version_no integer not null,
  status text not null,
  map_sha256 text not null,
  recogniser_version text not null,
  confirmed_by_user_id text,
  confirmed_at timestamptz,
  unique (document_version_id, version_no)
);

create table if not exists canonicalisation_entry (
  entry_id text primary key,
  map_id text not null,
  owner_user_id text not null,
  kind text not null,
  identifier_type text,
  source_provision_id text not null,
  source_start integer not null,
  source_end integer not null,
  original_value_ciphertext text not null,
  replacement text not null,
  defined_term_id text,
  detector text not null,
  confidence numeric not null,
  user_decision text not null default 'accept'
);

create table if not exists canonical_projection (
  projection_id text primary key,
  document_version_id text not null,
  map_id text not null,
  owner_user_id text not null,
  projection_sha256 text not null,
  projection_object_key text not null,
  offset_map_object_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists span_map_segment (
  segment_id text primary key,
  projection_id text not null,
  owner_user_id text not null,
  provision_id text not null,
  canonical_start integer not null,
  canonical_end integer not null,
  source_xml_anchor jsonb,
  source_start integer not null,
  source_end integer not null,
  replacement_entry_id text
);

create table if not exists provision (
  provision_id text primary key,
  document_version_id text not null,
  projection_id text,
  owner_user_id text not null,
  parent_provision_id text,
  order_index integer not null,
  node_type text not null,
  owns_text boolean not null,
  number text,
  heading text,
  scope_type text not null,
  scope_id text not null,
  canonical_text_ciphertext text,
  canonical_length integer not null default 0,
  source_xml_anchor jsonb,
  source_start integer not null default 0,
  source_end integer not null default 0,
  structural_path jsonb,
  classification_confidence numeric not null default 0,
  line_start integer not null default 0,
  line_end integer not null default 0
);
create index if not exists provision_owner_idx on provision (owner_user_id);
create index if not exists provision_version_idx on provision (document_version_id);

create table if not exists definition (
  definition_id text primary key,
  document_id text not null,
  document_version_id text not null,
  projection_id text,
  owner_user_id text not null,
  term text not null,
  normalised_term text not null,
  definition_kind text not null,
  scope_type text not null,
  scope_id text not null,
  defining_provision_id text not null,
  start_offset integer not null,
  end_offset integer not null,
  unique (document_id, document_version_id, scope_type, scope_id, normalised_term)
);

create table if not exists definition_use (
  definition_use_id text primary key,
  definition_id text not null,
  owner_user_id text not null,
  provision_id text not null,
  start_offset integer not null,
  end_offset integer not null
);

create table if not exists deal_map_entry (
  deal_map_entry_id text primary key,
  document_id text not null,
  document_version_id text not null,
  projection_id text,
  owner_user_id text not null,
  category text not null,
  label text not null,
  value text,
  provision_id text,
  start_offset integer,
  end_offset integer,
  extraction_method text not null default 'deterministic',
  confidence numeric not null,
  uncertainty_code text
);

create table if not exists source_capability (
  source_capability_id text primary key,
  document_version_id text not null,
  owner_user_id text not null,
  capability_name text not null,
  available boolean not null,
  detector_version text not null,
  suppression_reason text
);

create table if not exists proof_run (
  proof_run_id text primary key,
  matter_id text not null,
  owner_user_id text not null,
  document_version_id text not null,
  map_id text not null,
  projection_id text not null,
  status text not null,
  registry_sha256 text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  idempotency_key text,
  unique (owner_user_id, idempotency_key)
);
create index if not exists proof_run_owner_idx on proof_run (owner_user_id);

create table if not exists proof_check_execution (
  proof_check_execution_id text primary key,
  proof_run_id text not null,
  owner_user_id text not null,
  check_id text not null,
  check_version integer not null,
  status text not null,
  required_capabilities jsonb not null default '[]'::jsonb,
  missing_capabilities jsonb not null default '[]'::jsonb,
  hit_count integer not null default 0,
  latency_ms integer,
  error_code text,
  unique (proof_run_id, check_id, check_version)
);

create table if not exists proof_hit (
  proof_hit_id text primary key,
  proof_run_id text not null,
  document_version_id text not null,
  map_id text not null,
  projection_id text not null,
  owner_user_id text not null,
  check_id text not null,
  check_version integer not null,
  severity text not null,
  certainty text not null,
  provision_id text not null,
  quote_start integer not null,
  quote_end integer not null,
  server_quote_snapshot text,
  detail_code text not null,
  detail_args jsonb not null default '{}'::jsonb,
  source_mapping_valid boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists proof_hit_owner_idx on proof_hit (owner_user_id);

create table if not exists proof_feedback_ticket (
  ticket_id text primary key,
  proof_hit_id text not null,
  check_id text not null,
  check_version integer not null,
  owner_user_id text not null,
  user_id text not null,
  vote text not null,
  user_note text,
  review_status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists audit_event (
  audit_id text primary key,
  owner_user_id text,
  user_id text,
  matter_id text,
  action text not null,
  subject_type text,
  subject_id text,
  request_id text,
  ip_hash text,
  user_agent_hash text,
  detail_codes jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_owner_idx on audit_event (owner_user_id);

create table if not exists deletion_job (
  deletion_id text primary key,
  owner_user_id text not null,
  matter_id text not null,
  requested_at timestamptz not null default now(),
  revoked_at timestamptz,
  purge_due_at timestamptz not null,
  completed_at timestamptz,
  policy_version text not null,
  relational_counts jsonb,
  blob_key_counts jsonb,
  failure_status text
);

create table if not exists app_config (
  key text primary key,
  value text not null
);

insert into app_config (key, value) values
  ('retention.purge_after_days', '30'),
  ('retention.inactivity_months', '12'),
  ('retention.inactivity_notice_days', '14'),
  ('file_byte_cap', '26214400'),
  ('page_cap', '80')
on conflict (key) do nothing;
