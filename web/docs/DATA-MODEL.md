# Agmt Data Model

**Status:** Normative companion to [SPEC.md](SPEC.md).

**Production store:** PostgreSQL for relational state; vendor-neutral encrypted object storage for
originals, projections and generated files. SQLite MAY mirror the schema for local tests/eval.

All IDs are opaque UUIDs unless stated otherwise. All timestamps are UTC with timezone. Every mutable
object has `created_at` and `updated_at`; immutable events omit `updated_at`. JSON fields use a
versioned schema name/version. Document text, quotes, prompts and raw model responses MUST NOT appear
in operational logs.

## 1. Shared enums

| Name | Values |
|---|---|
| `instrument` | `sha \| ssa \| spa \| disclosure_letter \| unsupported \| unknown` |
| `represented_party` | `company \| promoter \| investor \| seller \| purchaser \| other` |
| `stage` | `drafting \| negotiation \| signing \| closing` |
| `run_status` | `pending \| planning \| running \| reviewing \| complete \| partial \| failed \| cancelled` |
| `severity` | `critical \| high \| medium \| low` |
| `reviewer_stamp` | `confirm \| downgrade \| reject \| unreviewed` |
| `disposition` | `null \| accepted \| edited \| rejected \| parked` |
| `version_classification` | `still_open \| resolved \| changed \| new` |
| `source_quality` | `high \| medium \| low \| unreadable` |
| `zdr_status` | `true \| false \| unknown` |

## 2. Identity, sessions and entitlement

### `user_account`

| Field | Type | Constraint |
|---|---|---|
| `user_id` | ID | primary key |
| `email_normalised` | text | unique, lower-cased |
| `email_verified_at` | timestamp/null | null means no document access |
| `display_name` | text/null | presentation only |
| `status` | `active \| disabled \| deletion_pending` | default active |
| `created_at` | timestamp | required |

### `auth_identity`

| Field | Type | Constraint |
|---|---|---|
| `identity_id` | ID | primary key |
| `user_id` | ID | foreign key |
| `provider` | `google \| email_magic_link` | required |
| `provider_subject` | text | unique with provider |
| `created_at` | timestamp | required |

### `magic_link_token`

| Field | Type | Constraint |
|---|---|---|
| `token_id` | ID | primary key |
| `email_normalised` | text | required |
| `token_hash` | bytes/text | unique; raw token never stored |
| `expires_at` | timestamp | issued + 15 minutes |
| `used_at` | timestamp/null | non-null prevents replay |
| `request_ip_hash` | text | rate-limit/audit only |
| `created_at` | timestamp | required |

### `session`

| Field | Type | Constraint |
|---|---|---|
| `session_id` | ID | primary key |
| `user_id` | ID | foreign key |
| `token_hash` | text | unique; cookie token not stored raw |
| `last_seen_at` | timestamp | idle expiry basis |
| `absolute_expires_at` | timestamp | maximum seven days |
| `revoked_at` | timestamp/null | immediate invalidation |
| `created_at` | timestamp | required |

### `review_entitlement` and `credit_event`

`review_entitlement` holds `user_id`, `review_enabled`, available extra-run credits and available
stronger-override credits. `credit_event` is an immutable debit/credit ledger with
`credit_event_id`, `user_id`, optional `review_run_id`, `kind`,
`delta`, `reason_code`, external entitlement reference and `created_at`. Pricing and payment
provider objects are outside this specification.

## 3. Matter and mandate

### `matter`

| Field | Type | Constraint |
|---|---|---|
| `matter_id` | ID | primary key |
| `owner_user_id` | ID | required; indexed tenancy key |
| `name` | text | required |
| `status` | `active \| archived \| deletion_pending` | required |
| `active_mandate_version_id` | ID/null | latest confirmed mandate |
| `created_at`, `updated_at` | timestamp | required |
| `deleted_at` | timestamp/null | access revoked when set |

### `mandate_version`

| Field | Type | Constraint |
|---|---|---|
| `mandate_version_id` | ID | primary key |
| `matter_id`, `owner_user_id` | ID | required |
| `version_no` | integer | unique within Matter |
| `represented_party` | enum | required |
| `instruments` | enum array | non-empty |
| `stage` | enum | required |
| `must_protect_notes_ciphertext` | encrypted text/null | user source |
| `canonical_notes` | encrypted text/null | model-safe projection |
| `mandate_hash` | SHA-256 | unique within Matter content |
| `created_by_user_id` | ID | required |
| `created_at` | timestamp | immutable |

A ReviewPlan references exactly one `mandate_version_id`; it never reads the Matter’s moving active
pointer at execution time.

## 4. Document, original and canonical projection

### `document`

| Field | Type | Constraint |
|---|---|---|
| `document_id` | ID | primary key |
| `matter_id`, `owner_user_id` | ID | required |
| `logical_name` | text | required |
| `role` | `primary \| companion \| disclosure \| ancillary` | required |
| `user_instrument` | instrument | user-confirmed/unknown |
| `detected_instrument` | instrument | deterministic result |
| `current_version_id` | ID/null | convenience pointer |
| `created_at` | timestamp | required |

### `document_version`

| Field | Type | Constraint |
|---|---|---|
| `document_version_id` | ID | primary key |
| `document_id`, `matter_id`, `owner_user_id` | ID | required |
| `version_no` | integer | unique within Document |
| `supersedes_version_id` | ID/null | immutable chain |
| `source_sha256` | SHA-256 | unique with Document; idempotency key |
| `mime_type` | text | DOCX or allowed PDF fallback |
| `byte_size` | integer | required |
| `page_count` | integer | required after ingest |
| `page_count_method` | `docx_property \| estimated \| pdf_pages` | required |
| `original_object_key` | opaque text | encrypted blob only |
| `wrapped_data_key`, `cipher_metadata` | encrypted bytes/JSON | envelope encryption |
| `ingest_status` | `uploaded \| map_pending \| indexed \| refused \| failed` | required |
| `refusal_code` | text/null | e.g. page cap/unreadable |
| `source_quality` | enum | required |
| `structure_confidence` | decimal 0–1 | required when indexed |
| `index_quality_version` | text | required when indexed |
| `ingest_schema_version` | text | required |
| `created_at` | timestamp | immutable |

### `canonicalisation_map`

| Field | Type | Constraint |
|---|---|---|
| `map_id` | ID | primary key |
| `document_version_id`, `owner_user_id` | ID | required |
| `version_no` | integer | unique within Document Version |
| `status` | `proposed \| confirmed \| superseded` | only confirmed enters Review |
| `map_sha256` | SHA-256 | over ordered entries/decisions |
| `recogniser_version` | text | Presidio + Indian recogniser version |
| `confirmed_by_user_id` | ID/null | required when confirmed |
| `confirmed_at` | timestamp/null | required when confirmed |

### `canonicalisation_entry`

| Field | Type | Constraint |
|---|---|---|
| `entry_id` | ID | primary key |
| `map_id` | ID | foreign key |
| `kind` | `legal_name \| identifier` | required |
| `identifier_type` | text/null | PAN/Aadhaar/etc. |
| `source_provision_id` | ID | proposed index provision |
| `source_start`, `source_end` | integer | original extracted-text range |
| `original_value_ciphertext` | encrypted text | never sent to a model |
| `replacement` | text | defined term or typed placeholder |
| `defined_term_id` | ID/null | required for legal-name replacement |
| `detector`, `confidence` | text/decimal | provenance |
| `user_decision` | `accept \| correct \| not_identifier` | confirmation required |

### `canonical_projection`

| Field | Type | Constraint |
|---|---|---|
| `projection_id` | ID | primary key |
| `document_version_id`, `map_id`, `owner_user_id` | ID | required |
| `projection_sha256` | SHA-256 | required |
| `projection_object_key` | opaque encrypted object reference | canonical model-readable JSON/text |
| `offset_map_object_key` | opaque encrypted object reference | bidirectional mapping |
| `created_at` | timestamp | immutable |

### `span_map_segment`

A materialised/indexable projection of the offset map with `segment_id`, `projection_id`,
`provision_id`, canonical start/end, source XML anchor, source start/end and replacement entry ID.
Segments MUST be ordered, non-overlapping in canonical coordinates and sufficient to locate the source
for redline validation.

## 5. DocumentIndex

### `provision`

| Field | Type | Constraint |
|---|---|---|
| `provision_id` | ID | primary key; version-scoped |
| `document_version_id`, `projection_id` | ID | required |
| `parent_provision_id` | ID/null | tree edge |
| `order_index` | integer | unique within parent |
| `node_type` | `document \| part \| recital \| clause \| subclause \| schedule \| annex \| definition_entry \| signature_block \| unclassified` | required |
| `owns_text` | boolean | internal node=false; text leaf=true |
| `number`, `heading` | text/null | display/resolution |
| `scope_type`, `scope_id` | text/ID | namespace |
| `canonical_text_ciphertext` or object range | encrypted text/ref | model text |
| `canonical_length` | integer | offset validation |
| `source_xml_anchor` | JSON | paragraph/table/XML path |
| `source_start`, `source_end` | integer | extracted-source coordinates |
| `structural_path` | ordered JSON | version mapping |
| `classification_confidence` | decimal 0–1 | required |
| `line_start`, `line_end` | integer | ownership audit |

Unique/exclusion constraints MUST prevent two `owns_text=true` leaves from owning the same extracted
non-blank line.

### Definitions

- `definition`: `definition_id`, Document/Version/Projection IDs, `term`,
  `normalised_term`, `definition_kind` (including `defined_party`), `scope_type`,
  `scope_id`, defining provision and start/end.
- `definition_use`: `definition_use_id`, `definition_id`, use provision and start/end.
- Unique key: Document + Document Version + scope type + scope ID + normalised term.

### `provision_digest`

Stores `digest_id`, provision/projection IDs, two-or-three-sentence encrypted digest,
`routing_only=true`, exact digest model/prompt versions, model-call ID and timestamp. Evidence
tables MUST NOT foreign-key to a digest.

### Deal map and capabilities

- `deal_map_entry`: document/projection IDs, category, label/value, provision/start/end,
  `extraction_method=deterministic`, confidence and uncertainty code.
- `source_capability`: Document Version, capability name, `available`, detector version and
  suppression reason. Examples: comments, revisions, fields, tables, headers/footers.

## 6. Proof

### `proof_run`

| Field | Type | Constraint |
|---|---|---|
| `proof_run_id` | ID | primary key |
| Matter/owner/Document Version/map/projection IDs | ID | required |
| `status` | `running \| complete \| partial \| refused \| failed` | required |
| `registry_sha256` | SHA-256 | exact check registry |
| `started_at`, `ended_at` | timestamp | required as applicable |
| `idempotency_key` | text | unique with owner |

### `proof_check_execution`

Stores run, check ID/version, status `completed|suppressed|failed`, required/missing capabilities,
hit count, latency and error/suppression code. Absence of this row MUST NOT mean pass.

### `proof_hit`

| Field | Type | Constraint |
|---|---|---|
| `proof_hit_id` | ID | primary key |
| `proof_run_id`, Document Version/map/projection IDs | ID | required |
| `check_id`, `check_version` | text/integer | required |
| `severity`, `certainty` | enum | required |
| `provision_id`, `quote_start`, `quote_end` | ID/integer | valid canonical range |
| `server_quote_snapshot` | encrypted text | filled only after range validation |
| `detail_code`, `detail_args` | text/JSON | deterministic formatter input |
| `source_mapping_valid` | boolean | required |
| `created_at` | timestamp | immutable |

### `proof_feedback_ticket`

Stores hit/check versions, owner/user, `vote=not_a_defect`, user note, human-review status/decision
and timestamps. It has no foreign key to check enablement/suppression.

## 7. Review plans, execution and provenance

### `catalogue_version`

`catalogue_version_id`, semantic version, SHA-256 over validated YAML, package ID/version manifest,
skill version, created_at and active flag. Historical rows are immutable.

### `review_run`

| Field | Type | Constraint |
|---|---|---|
| `review_run_id` | ID | primary key |
| Matter/owner/mandate/Document Version/map/projection/Proof run IDs | ID | required |
| `catalogue_version_id`, `plan_id` | ID | required before analysis |
| `status` | run_status | required |
| `incomplete_source` | boolean | required |
| `stronger_override` | boolean | one-run setting |
| `include_proposed_language` | boolean | default false; typed explicit drafting request |
| `estimate_version`, `estimated_charge_min/max/currency`, `estimated_run_debit` | scalar | snapshot shown before click |
| `skill_version`, `engine_version`, `model_config_version` | text | required |
| aggregate tokens/cached tokens/cost | numbers | derived from calls |
| `replan_count` | integer | 0–2 |
| `idempotency_key` | text | unique with owner |
| `started_at`, `ended_at` | timestamp | required as applicable |

### `review_plan` and `review_plan_package`

`review_plan` stores run, version number, compiler version, mandate/catalogue/Document bindings,
planner model-call ID, status and parent plan for a replan.

Each package row stores package ID/version, activation type, priority, activation signal IDs,
resolved must-read provision IDs, required definition IDs, Proof preseed hit IDs, mandatory overlap
package IDs, budget reservation and `required=true|false`.

### `coverage_ledger`

| Field | Type | Constraint |
|---|---|---|
| `coverage_id` | ID | primary key |
| run/plan/package/version IDs | ID | required |
| `required` | boolean | required |
| `status` | `pending \| running \| complete \| incomplete \| skipped \| failed` | required |
| `must_read_resolved/read/missing` | ID arrays | required |
| `required_definitions_resolved/missing` | ID/type arrays | required |
| `proof_preseed_hit_ids` | ID array | required |
| `mandatory_overlap_status` | JSON | one entry per overlap |
| `get_clause_provision_id` | ID/null | at most one per analyst call |
| `plan_miss_events` | event ID array | required |
| `source_flags` | text array | required |
| analyst/synth/reviewer statuses | text/JSON | required |
| `incomplete_reason_code/detail` | text/JSON | required when not complete |
| `unread_scope_display` | JSON | headings/provision IDs used by partial copy |

### `run_event`, `run_checkpoint`, `model_call`

- `run_event`: run, monotonically increasing sequence, event type, metadata-only payload, timestamp
  and latency. Unique `(review_run_id, sequence)`.
- `run_checkpoint`: run, sequence, plan ID, completed package IDs, pending package IDs, budget state,
  candidate IDs and message hashes. It stores no chain of thought.
- `model_call`: run, role, exact model/provider/gateway, prompt version, request ID, status,
  tokens in/out/cached, cost/currency, latency, ZDR status, package ID, input/output hashes and
  timestamp. Raw prompt/response text is forbidden.

## 8. Candidates, evidence, issues and dispositions

### `issue_candidate`

The nine model fields are stored as `provision_id`, `issue_type`, `severity`,
`quote_start`, `quote_end`, `mandate_why`, `ask`, nullable `proposed_language` and nullable
`absence_evidence_id`. Server fields add candidate/run/package/model-call IDs, versions, validated
quote snapshot, source mapping, validation status/reason and timestamp.

A database/application constraint MUST reject any candidate whose issue type is not in the bound
package version or whose range is invalid. There is no model-supplied quote column.

### `absence_evidence`

| Field | Type | Constraint |
|---|---|---|
| `absence_evidence_id` | ID | primary key |
| Document Version/projection/package IDs | ID | required |
| `searched_scope_provision_ids` | ID array | non-empty |
| `expected_item` | text/type code | required |
| `anchor_provision_id`, `anchor_start`, `anchor_end` | ID/integer | valid range |
| `negative_inventory_query_version` | text | required |
| `negative_inventory_query_args` | JSON | required |
| `negative_inventory_count` | integer | MUST equal zero at record time |
| `generated_by_server_at` | timestamp | required |

### Evidence and relationship tables

- `evidence_span`: evidence ID, candidate or key-issue ID, evidence version, role
  `primary|supporting|anchor`, provision/start/end, server quote snapshot, source-map segment IDs and
  validation timestamp.
- `dedup_cluster`: deterministic key fields, surviving candidate ID and collapsed candidate IDs.
- `synthesis_relation`: source candidate IDs, relation
  `overlap|contradiction|incompatible_asks|merged|kept_separate`, output candidate/issue ID and
  synthesizer model-call ID.
- `reviewer_decision`: candidate/issue ID, stamp, optional lower severity, typed reason,
  reviewer model-call ID and timestamp.

### `issue_lineage`

| Field | Type | Constraint |
|---|---|---|
| `lineage_id` | ID | primary key |
| `matter_id`, `owner_user_id` | ID | required |
| `issue_type` | text | stable conceptual type |
| `origin_document_id`, `origin_provision_path` | ID/JSON | required |
| `created_at` | timestamp | immutable |
| `latest_issue_id` | ID | convenience pointer |

### `key_issue`

| Field | Type | Constraint |
|---|---|---|
| `issue_id`, `lineage_id` | ID | primary key / foreign key |
| Matter/owner/run/mandate/Document Version/map/projection/catalogue IDs | ID | required |
| `evidence_version` | positive integer | required |
| `primary_package_id`, `source_package_ids` | ID / ID array | required |
| `issue_type`, `topic` | text | required |
| `severity` | enum | current post-review value |
| `provision_id`, `clause_display`, start/end, server quote snapshot | mixed | validated evidence |
| `mandate_why`, `ask` | encrypted text | required |
| `proposed_language` | encrypted text/null | gated by SPEC Section 8.3 |
| `absence_evidence_id` | ID/null | required for absence issue |
| `reviewer_stamp`, `reviewer_reason` | enum/text | required |
| `current_disposition` | disposition/null | materialised state |
| `shareable` | boolean | default false; true only if accepted |
| `coverage_flags` | text array | required |
| `version_classification` | enum/null | Slice 6 |
| `status` | `active \| graveyard \| system_rejected \| evidence_invalid` | required |
| `origin_run_id` | ID/null | delete sets null so lineage/graveyard survives |
| `created_at`, `updated_at` | timestamp | required |

### Revisions and disposition events

- `key_issue_revision`: issue ID, monotonically increasing content version, snapshot of editable
  `mandate_why/ask/proposed_language`, editor user ID and timestamp.
- `disposition_event`: issue ID/lineage ID, actor user, prior/next disposition, prior/next shareable,
  bound issue revision, note and timestamp. Append-only.
- `provision_version_map`: old/new version/provision IDs, method
  `structural_path|exact_text|approved_similarity`, confidence and mapping version.
- `issue_version_result`: prior/current issue IDs, lineage, four-way classification, evidence-change
  flag, carry-forward-unconfirmed flag and reason.

## 9. Exports and Mail

### `export_job`

Stores export ID, owner/Matter/run/list-snapshot/Document Version IDs, type
`partner_pdf|partner_docx|tracked_docx`, status, included/excluded issue IDs with reasons, source
validation result, encrypted artifact object key/checksum, expiry/deletion status and audit timestamp.
Generated files are owner-only; no public share token exists.

### `mail_draft` and revisions

| Field | Type | Constraint |
|---|---|---|
| `mail_draft_id` | ID | primary key |
| owner/Matter/run/list-snapshot IDs | ID | required |
| `draft_type` | `partner_brief \| client_update \| team_update` | exhaustive |
| `eligibility_query_version` | text | required |
| `eligible_issue_ids` | ID array | immutable snapshot per revision |
| `user_prompt_ciphertext` | encrypted text/null | style/emphasis input |
| `house_skeleton_json` | JSON | facts removed |
| `mail_model_call_id`, prompt/model versions | ID/text | required for generated revision |
| `current_revision_id` | ID | pointer |
| `created_at` | timestamp | required |

`mail_revision` stores immutable editable body ciphertext, parent revision, generator/user editor and
timestamp. `mail_sentence` stores revision, order, encrypted text, kind
`factual|non_factual|user_authored_untraced`, eligible `issue_id` values (the list row IDs), trace status
`valid|stale|not_required` and text hash. `mail_gap` stores revision, code
`requested_fact_not_on_list`, encrypted requested concept, source prompt span and display status.

A generated factual sentence requires at least one `issue_id` that is in the revision’s eligible
snapshot.
A user edit creates a new sentence/revision and cannot retain `trace_status=valid` automatically.

## 10. Audit, deletion and hard constraints

### `audit_event`

Metadata-only: audit ID, owner/user, Matter, action, subject type/ID, request ID, IP/user-agent hashes,
detail codes and timestamp. It MUST NOT store document, quote, prompt, Mail body or model response text.

### `deletion_job`

Stores deletion ID, owner/Matter, requested/revoked/purge-due/completed timestamps, configured policy
version, relational-table counts, blob-key counts and failure status. User access is revoked at
`requested_at`; physical purge timing follows the Section 14 retention decision.

### Required indexes and constraints

- Every top-level query path is indexed by `owner_user_id`; Matter children are indexed by
  `matter_id`.
- Unique Document checksum: `(document_id, source_sha256)`.
- Unique definition namespace: Document + Version + scope type + scope ID + normalised term.
- Unique Proof execution: `(proof_run_id, check_id, check_version)`.
- Unique exact dedup key: Matter + mandate + Document Version + provision + issue type + start + end.
- Unique run-event sequence: `(review_run_id, sequence)`.
- Unique disposition order/content version per issue.
- `shareable=true` requires `current_disposition=accepted`.
- `reviewer_stamp=reject` requires `status=system_rejected` unless retained only as a raw candidate.
- An absence issue requires a zero-count `absence_evidence`; a positive-span issue forbids one.
- A model-call row can reference IDs but no text-bearing prompt/response column.
- Foreign keys MUST prevent cross-Matter and cross-owner bindings. Application ownership predicates
  remain mandatory even when foreign keys pass.
