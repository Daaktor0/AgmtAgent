# Agmt Agent v2 implementation plan

Status: planning only. No Agmt Agent repository files are being changed by this
work.

Inspection point: the default main branch of
[Daaktor0/AgmtAgent](https://github.com/Daaktor0/AgmtAgent), inspected on
19 August 2026. The newest visible commit is
[15e38ec](https://github.com/Daaktor0/AgmtAgent/commit/15e38ec545f25e44ccc5d3872f5608414347e6c5),
which describes the recent v2 review machinery. This plan also treats the
repository's
[draft v2 specification](https://github.com/Daaktor0/AgmtAgent/blob/main/v2%20data/SPEC-V2.md)
and the two architecture reports as intended targets, not as evidence that
those target modules already exist.

## 1. Executive decision

Agmt Agent should become a durable, evidence-led agreement-review runtime with
a thin Word interaction shell:

1. Word owns selection capture, document-version snapshots, navigation and all
   document writes.
2. A modality-neutral Contextual Command owns the lawyer's objective. Voice,
   typing, context menu, ribbon and command-palette input all produce the same
   typed object.
3. A small deterministic resolver converts selection and document indexes into
   bounded reference candidates. The supervisor may choose among candidates; it
   may not invent an unresolved clause.
4. Agmt Standard enters through the existing evidence-led harness. It still
   plans, reads exact ranges, looks up definitions and uses, searches for
   overlap, delegates bounded work, runs deterministic checks, records issues,
   verifies quotations and obtains independent review.
5. A SQLite-backed run ledger and event log make runs resumable. The first
   implementation should use a small in-process worker and explicit state
   machine, not Temporal, LangGraph or another workflow framework.
6. A signed native companion is justified only for reliable global
   key-down/key-up push-to-talk and local streaming speech. It receives no
   document text and has no Word-write authority.

The immediate product is therefore not “voice AI”. It is:

> Word selection + natural command -> typed Contextual Command -> safe
> reference resolution -> existing Agmt Standard evidence loop -> contextual
> result -> explicit, version-checked Word action.

The most important implementation rule is to make the current code safer and
more durable before adding more agent activity. The current repository already
contains valuable foundations: a versioned check registry, issue-time anchor
rejection, overlap enforcement, reviewer pass, mechanical corpus and Word
tracked-change/comment actions. Those foundations should be wrapped and
strengthened, not discarded.

## 2. What is actually in the repository

### 2.1 Current implementation seams

| Area | Current evidence | v2 consequence |
|---|---|---|
| Product shell | [README.md](https://github.com/Daaktor0/AgmtAgent/blob/main/README.md) describes a Word right-hand pane, a supervisor, tools, tracked changes, comments and human approval. | The product concept is already correct; the missing work is durable state, fidelity and interaction. |
| Supervisor | [agent/supervisor.py](https://github.com/Daaktor0/AgmtAgent/blob/main/agent/supervisor.py) builds one Document, one Toolbox, resolves one supervisor model, loops up to max_supervisor_steps, runs the reviewer and saves only at the end. | Extract a durable executor around this loop. Keep Supervisor as a compatibility façade until the new runner is proven. |
| Tools | [agent/tools.py](https://github.com/Daaktor0/AgmtAgent/blob/main/agent/tools.py) has the right tool names and most of the intended contracts: outline, exact read, search, definitions, checks, delegation, overlap, issues, questions and plan. | Add typed request context, block/version IDs, cursor pagination, provenance and policy errors. Do not replace the tool surface. |
| Deterministic layer | [agent/document.py](https://github.com/Daaktor0/AgmtAgent/blob/main/agent/document.py) contains the parser, structure model, definitions, usages, xrefs and many check runners. | Move it into a package with a compatibility __init__.py; split runners only after golden tests are frozen. |
| Check registry | [agent/check_registry.py](https://github.com/Daaktor0/AgmtAgent/blob/main/agent/check_registry.py) already has stable IDs, legacy names, families, versions, requirements, scope, runners and certainty. | Reuse it as the v2 registry. Move it behind agent/document/checks/registry.py only after imports are protected. |
| Matter logic | [agent/matter.py](https://github.com/Daaktor0/AgmtAgent/blob/main/agent/matter.py) already has ad hoc cross-document checks and search. | Promote it into persisted matter/document/version services and tools; do not re-implement the detection logic. |
| Issue policy | Toolbox.record_issue already rejects invented quotations, missing old text for revise/delete, thin high-severity consequences, invalid paragraph indexes, invalid refs and missing overlap traces. | Preserve those invariants and add typed anchor, evidence, provenance, reviewer and document-version fields. |
| Reviewer | [agent/reviewer.py](https://github.com/Daaktor0/AgmtAgent/blob/main/agent/reviewer.py) re-verifies anchors, then sends compact issue metadata to a second model. | Make the reviewer re-read the cited evidence and overlap evidence; keep it independent from the supervisor transcript. |
| Persistence | [agent/memory/store.py](https://github.com/Daaktor0/AgmtAgent/blob/main/agent/memory/store.py) has one SQLite connection and four tables: run, issue, disposition and position. It creates tables from a single SCHEMA string and has no migration ledger or event table. | Introduce migrations and append-only run events without losing existing data. |
| Router | [agent/router.py](https://github.com/Daaktor0/AgmtAgent/blob/main/agent/router.py) is OpenRouter-only, has live catalogue resolution and fail-closed preference matching, but uses a process-global configuration/router and does not persist normalized usage, cost or provider provenance. | Put an allowlisted provider gateway under a compatibility Router; make request configuration immutable. |
| Server | [server/app.py](https://github.com/Daaktor0/AgmtAgent/blob/main/server/app.py) is a single FastAPI module with global cfg and router, synchronous /api/review SSE, /api/checks, settings, issue disposition, run lookup and positions. | Split routes and add authenticated, durable v2 endpoints. Keep old endpoints as adapters during migration. |
| Word ingestion | [addin/taskpane.js](https://github.com/Daaktor0/AgmtAgent/blob/main/addin/taskpane.js) reads body paragraphs, list prefixes/levels, optional comments, revisions and flat tables. It does not ingest headers, footers, footnotes, content controls or reliable before/current revision text. | Add capability negotiation and full-fidelity versioned ingestion. |
| Word writes | The same file finds an exact old_text by unique local ID, paragraph index or unique document-wide search, then replaces/deletes or inserts a comment. It has no document-version precondition or post-write verification. | Extract apply.js; make every write a two-phase, version-checked, post-verified action. |
| Add-in manifest | [addin/manifest.xml](https://github.com/Daaktor0/AgmtAgent/blob/main/addin/manifest.xml) exposes a task pane and one Home-tab button. It has no shared runtime, context menu, custom shortcut block or long-lived command runtime. | Add shared runtime and fixed command surfaces. A global hold-to-talk key still belongs to the companion. |
| Evaluation | [tests/test_pipeline.py](https://github.com/Daaktor0/AgmtAgent/blob/main/tests/test_pipeline.py), [tests/test_eval_run.py](https://github.com/Daaktor0/AgmtAgent/blob/main/tests/test_eval_run.py), four synthetic corpus areas and CI for deterministic checks provide a good seed. | Add migration, API, anchor, contextual-command, fidelity and async recovery tests; grow the corpus before model-routing work. |

### 2.2 What the recent commits did and did not deliver

The recent commit sequence is useful evidence of the intended direction:

- [0f6636a](https://github.com/Daaktor0/AgmtAgent/commit/0f6636a93963702d77141eacafe37d388af30231)
  added the reviewer pass, fail-closed routing and evaluation CI.
- The history records the overlap-trace and truncation change; the source
  confirms pagination fields and overlap rejection.
- [13a2e58](https://github.com/Daaktor0/AgmtAgent/commit/13a2e58a3ce947d482bb52cfbf49405160a7f471)
  added the v2 corpus and quality metrics.
- [15e38ec](https://github.com/Daaktor0/AgmtAgent/commit/15e38ec545f25e44ccc5d3872f5608414347e6c5)
  added more checks, Word ingestion fields, matter checks, plan tools and
  dispositions.

Those changes are substantive, but the repository still has no:

- agent/document package;
- agent/orchestrator package or durable run executor;
- agent/providers gateway;
- migration directory or schema version;
- matter/document/document-version tables;
- run-event/checkpoint tables;
- contextual-command schema or resolver;
- Word shared runtime, context menu or selection-aware result surface;
- native desktop companion;
- version-safe Word write protocol;
- authenticated local pairing or per-request configuration context.

### 2.3 The v2 specification is a blueprint, not an implementation

[v2 data/SPEC-V2.md](https://github.com/Daaktor0/AgmtAgent/blob/main/v2%20data/SPEC-V2.md)
already names the desired module map, SQL entities, check set, tools, API
surface, phases and non-functional requirements. This plan converts that draft
into a dependency-ordered build plan and adds the interaction layer from the
second report. It deliberately does not create a competing architecture.

## 3. Target v2 boundary

~~~mermaid
flowchart TD
    W["Word add-in: selection, snapshot, UI, navigation, writes"]
    C["Contextual Command: modality-neutral typed intent"]
    R["Reference and version gate: deterministic first"]
    A["Agmt Standard: plan, evidence, tools, workers, review"]
    S["Durable run ledger: state, events, checkpoints, audit"]
    W --> C
    C --> R
    R --> A
    A --> S
    S --> W
~~~

### 3.1 System boundaries

The Word add-in is the system of record for the live document view. The server
stores an immutable normalized snapshot and its derived indexes. The supervisor
never receives an unbounded document dump; it receives tool results tied to a
specific document_version_id.

The native companion, when introduced, is a narrow input peripheral:

- press/release/cancel events;
- microphone permission and lifecycle;
- VAD and local STT;
- partial/final transcript events;
- transient listening/progress indication.

It does not:

- scrape Word through COM;
- read the document;
- call model providers with the document;
- apply Word edits;
- retain audio by default;
- become a second legal reasoning agent.

### 3.2 Compatibility strategy

The migration should be additive and reversible:

1. Add typed schemas and migrations first.
2. Keep POST /api/review, POST /api/checks,
   agent.supervisor.Supervisor, agent.router.Router and
   agent.document.Document working while their implementations move behind
   façades.
3. Introduce canonical v2 routes and make the add-in use them only after
   contract tests pass.
4. Remove legacy route behavior only after one release has emitted deprecation
   telemetry and the current add-in has been migrated.

Do not combine the file-to-package move, database migration, async API and
manifest change in one commit.

## 4. Target module layout

This is the target layout after the staged refactor. The compatibility files
are intentional; they make each extraction independently testable.

~~~text
agent/
  schemas/
    ids.py                 UUID and hash aliases
    document.py            Block, Clause, Definition, Comment, Revision, Table
    anchor.py              SelectionAnchor, BlockAnchor, ActionPrecondition
    command.py             ContextualCommand and resolver result models
    issue.py               Issue, Evidence, Provenance, ProposedAction
    run.py                 Run, RunEvent, Budget, Checkpoint
    api.py                 request/response envelopes and pagination

  config/                  created by moving agent/config.py to __init__.py
    __init__.py            compatibility exports: Config, load_skill
    settings.py            immutable per-request settings and deployment mode
    secrets.py             keyring/credential-store access and migration
    policy.py              provider/model allowlist and data-handling policy
    providers.yaml         non-secret Agmt Standard route profiles

  document/                created by moving agent/document.py to __init__.py
    __init__.py            compatibility exports: Document, Issue, build_document
    model.py               normalized immutable document projection
    ingest.py              payload validation and block normalization
    segment.py             style/list/regex structure detection
    definitions.py         definition and use-site indexes
    anchors.py             block and selection anchor resolution
    checks/
      registry.py          moved check registry; compatibility import retained
      structure.py
      defterms.py
      amounts.py
      dates.py
      parties.py
      execution.py
      crossdoc.py

  contextual/
    command.py             command lifecycle and idempotency
    interpreter.py         transcript/text -> IntentSpec
    resolver.py            deterministic/indexed/model-bounded refs
    policy.py              ambiguity and action-risk gates
    thread.py              follow-ups over fresh document versions

  orchestrator/
    state.py               RunState and allowed transitions
    loop.py                extracted Supervisor loop
    plan.py                plan/replan state and validation
    budget.py              step/token/cost/latency ceilings
    prompt.py              sectioned skill and context assembly
    delegate.py            bounded sequential/parallel worker execution
    reviewer.py            independent evidence re-read
    runner.py              durable queue, lease, recovery and checkpoints
    events.py              typed event creation and append/replay

  providers/
    gateway.py             provider-neutral chat interface
    openrouter.py          current Router HTTP implementation moved here
    policy.py              allowlist, capabilities, region/ZDR metadata
    usage.py               usage/cost normalization and provenance

  memory/
    store.py               migration-backed repository and transactions
    migrations/
      0001_legacy_baseline.sql
      0002_run_issue_provenance.sql
      0003_matter_documents_versions.sql
      0004_run_events_checkpoints_audit.sql
      0005_contextual_commands.sql
      0006_positions_precedent.sql
    migrations.py          ordered runner, backup and compatibility checks
    dispositions.py        typed disposition capture
    positions.py           promotion/suppression and scope-aware lookup
    precedent.py           local precedent metadata/retrieval, later phase

  tools.py                 compatibility dispatch; delegates to ToolContext
  router.py                compatibility façade over providers.gateway
  supervisor.py            compatibility façade over orchestrator.loop
  check_registry.py        compatibility façade over document.checks.registry
  matter.py                compatibility façade over matter services

server/
  app.py                   app factory; no module-global mutable request state
  auth.py                  local pairing token and hosted session validation
  dependencies.py          request context, store, gateway and actor injection
  worker.py                local durable run worker
  routes/
    health.py
    settings.py
    matters.py
    documents.py
    runs.py
    commands.py
    issues.py
    positions.py
    precedent.py
    audit.py
    legacy.py              current /api/review and /api/checks adapters

addin/
  manifest.xml             shared runtime, command surfaces, requirement sets
  runtime.js               long-lived shared runtime state and bridge
  commands.js              executeFunction handlers for ribbon/context menu
  selection.js             current selection snapshot and anchor envelope
  ingest.js                full-fidelity Word extraction
  apply.js                 version-safe navigate/comment/tracked-change writes
  bridge.js                native companion handshake and input events
  taskpane.js              UI coordinator and legacy adapter
  taskpane.html
  taskpane.css
  ui/
    state.js
    selection-strip.js
    command-input.js
    result-card.js
    progress.js
    ambiguity.js

companion/                  separate deployable artifact; P1
  protocol.md
  windows/
    README.md
    src/...
    tests/...
~~~

### 4.1 File moves that need their own commits

Python cannot have both agent/document.py and agent/document/ at the same path.
Use these controlled renames:

- git mv agent/document.py agent/document/__init__.py, then extract code into
  model.py, segment.py and the check modules.
- git mv agent/config.py agent/config/__init__.py, then add settings.py,
  secrets.py and policy.py.
- Leave agent/supervisor.py, agent/router.py and
  agent/check_registry.py as import-compatible façades until all callers and
  tests use the new packages.
- Move agent/reviewer.py to agent/orchestrator/reviewer.py only after the
  façade test is in place.

## 5. Typed domain and API schemas

Pydantic v2 is already a runtime dependency. Use it at the API boundary and
for persisted JSON validation. Keep the deterministic document model free of
HTTP concerns.

### 5.1 Document version and block schemas

~~~python
class CapabilityReport(BaseModel):
    word_api: str
    available: dict[str, bool]
    degraded: list[str]
    suppressed_checks: list[str]
    ingest_schema_version: str

class Block(BaseModel):
    id: UUID
    document_version_id: UUID
    idx: int
    kind: Literal[
        "paragraph", "heading", "list_item", "table_cell", "header",
        "footer", "footnote", "endnote", "content_control", "textbox"
    ]
    text: str
    text_sha256: str
    list_prefix: str = ""
    list_level: int | None = None
    style: str = ""
    style_built_in: str = ""
    story_type: str = "main"
    table_id: str | None = None
    row: int | None = None
    col: int | None = None
    section: str = ""
    footnote_ref: str | None = None
    unique_local_id: str | None = None
    char_start: int | None = None
    char_end: int | None = None
    structural_path: list[str] = []

class DocumentVersion(BaseModel):
    id: UUID
    document_id: UUID
    version_no: int
    version_label: str = ""
    doc_hash: str
    source: Literal["word_addin", "upload", "import", "legacy"]
    capabilities: CapabilityReport
    blocks: list[Block]
~~~

The server, not the add-in, assigns stable block IDs after normalizing the
payload. The add-in supplies Word's uniqueLocalId as a durable diagnostic
anchor, never as the only identity.

### 5.2 Selection and action anchors

~~~python
class SelectionAnchor(BaseModel):
    story_type: str = "main"
    selected_text: str
    selected_text_sha256: str
    ooxml_sha256: str | None = None
    block_ids: list[UUID] = []
    unique_local_ids: list[str] = []
    first_block_idx: int | None = None
    last_block_idx: int | None = None
    prefix_text: str = ""
    suffix_text: str = ""
    structural_path: list[str] = []
    captured_at: datetime
    source_word_api: str

class ActionPrecondition(BaseModel):
    document_id: UUID
    document_version_id: UUID
    expected_doc_hash: str
    expected_selected_text_sha256: str
    anchor: SelectionAnchor
    old_text: str
    old_text_sha256: str
    anchor_method_allowed: list[str] = [
        "block_id", "unique_local_id", "scoped_exact", "candidate_confirmation"
    ]
    requires_confirmation_if_document_hash_changes: bool = True

class ProposedAction(BaseModel):
    action_id: UUID
    issue_id: UUID | None = None
    operation: Literal["navigate", "replace", "delete", "comment"]
    precondition: ActionPrecondition
    new_text: str = ""
    comment: str = ""
    requires_human_approval: bool = True
    risk: Literal["low", "medium", "high"]
~~~

Range.track() remains a runtime convenience only. The durable envelope is the
combination of version hash, exact text hash, block IDs, local IDs, structural
path and prefix/suffix. ooxml_sha256 is a disambiguator, not a promise that
OOXML is stable across all Word hosts.

### 5.3 Contextual Command schemas

~~~python
class RawInput(BaseModel):
    modality: Literal["voice", "text", "context_menu", "ribbon", "palette"]
    activation: Literal[
        "hold_to_talk", "click", "keyboard_shortcut", "context_menu",
        "ribbon", "typed"
    ]
    raw_text: str
    partial_text: list[str] = []
    language: str = "en"
    stt_engine: str | None = None
    stt_confidence: float | None = None
    audio_retained: bool = False

class IntentSpec(BaseModel):
    objective: Literal[
        "explain", "check", "compare", "find_uses", "find_definition",
        "draft", "comment", "navigate", "delete_everywhere", "summarise"
    ]
    requested_output: Literal[
        "answer", "issues", "minimum_amendment", "bubble_comment",
        "tracked_change", "locations", "comparison"
    ]
    constraints: list[str] = []
    party_scope: str | None = None
    urgency: Literal["normal", "fast", "high_risk"] = "normal"
    confidence: float

class ReferenceMention(BaseModel):
    mention_id: str
    text: str
    category: Literal[
        "selection", "relative_clause", "heading", "definition",
        "concept", "party", "document", "unknown"
    ]
    start: int
    end: int

class ReferenceCandidate(BaseModel):
    ref_id: str
    label: str
    document_id: UUID
    document_version_id: UUID
    block_ids: list[UUID] = []
    clause_ref: str | None = None
    score: float
    resolver: Literal["selection", "exact", "definition_index",
                      "outline", "concept_search", "model_choice"]

class ResolvedReference(BaseModel):
    mention_id: str
    status: Literal["resolved", "ambiguous", "not_found"]
    candidate: ReferenceCandidate | None = None
    alternatives: list[ReferenceCandidate] = []
    reason: str = ""

class ContextualCommand(BaseModel):
    command_id: UUID
    parent_command_id: UUID | None = None
    matter_id: UUID
    document_id: UUID
    document_version_id: UUID
    selection: SelectionAnchor | None = None
    context_refs: list[ReferenceCandidate] = []
    raw_input: RawInput
    interpreted_intent: IntentSpec | None = None
    mentions: list[ReferenceMention] = []
    references: list[ResolvedReference] = []
    status: Literal[
        "received", "interpreting", "ambiguous", "ready", "running",
        "waiting_user", "completed", "cancelled", "failed", "stale"
    ]
    provenance: dict
    run_id: UUID | None = None
    idempotency_key: str
    created_at: datetime
~~~

The original transcript and the interpreted intent are stored separately. The
lawyer must be able to see and correct the interpretation before a drafting
action is approved. Audio is not part of the durable command by default.

### 5.4 Issue, evidence and provenance

~~~python
class Evidence(BaseModel):
    document_version_id: UUID
    block_ids: list[UUID] = []
    refs: list[str] = []
    exact_quotes: list[str] = []
    quote_sha256: list[str] = []
    anchor_verified: bool | None = None
    anchor_method: str | None = None

class Provenance(BaseModel):
    tool_call_ids: list[str] = []
    model_calls: list[dict] = []
    provider_calls: list[dict] = []
    overlap_trace: list[str] = []
    plan_step_ids: list[str] = []
    input_command_id: UUID | None = None

class IssueRecord(BaseModel):
    issue_id: UUID
    run_id: UUID
    document_version_id: UUID
    local_id: int
    ref: str
    block_id: UUID | None = None
    title: str
    classification: str
    severity: Literal["high", "medium", "low"]
    position: str
    consequence: str
    old_text: str = ""
    new_text: str = ""
    comment: str = ""
    evidence_tier: Literal[1, 2, 3]
    evidence: Evidence
    consequential_refs: list[str] = []
    reviewer_verdict: str | None = None
    reviewer_note: str | None = None
    provenance: Provenance
~~~

Hard invariants:

- Tier 1 is deterministic and reproducible.
- Tier 2 requires an exact quote and a resolved block/version.
- Tier 3 cannot expose an insertion or replacement action.
- Any non-empty new_text requires an overlap trace.
- Any revise/delete action requires exact old_text.
- An issue may never be inserted into Word without an action precondition.

## 6. Database migrations

### 6.1 Migration runner

Replace the single SCHEMA string in agent/memory/store.py with
agent/memory/migrations.py. The runner must:

1. Open SQLite with PRAGMA foreign_keys = ON, WAL mode and a busy timeout.
2. Create schema_migration(version INTEGER PRIMARY KEY, name TEXT, applied_at
   TEXT, checksum TEXT).
3. Run ordered SQL/Python migrations in one transaction where SQLite permits it.
4. Make ALTER TABLE additions idempotent by checking PRAGMA table_info.
5. Back up a local database before the first upgrade.
6. Refuse to continue on a checksum mismatch for an already-applied migration.
7. Keep legacy rows; never reset or recreate the database in place.
8. Expose the applied schema version through /api/health.

SQLite is the first implementation. The schema should use portable types and
keep Postgres compatibility in mind, but introducing a second database engine
is not a P0 task.

### 6.2 Migration chain

| Migration | Concrete change | Compatibility requirement |
|---|---|---|
| 0001_legacy_baseline | Create run, issue, disposition, position and indexes if missing; create schema_migration. | Must open a current v1 database without changing existing rows. |
| 0002_run_issue_provenance | Add nullable matter_id, document_version_id, engine_version, skill_version, model_roles_json, provider_provenance_json, budget_json, check_id, check_version, family, certainty, anchor_verified, anchor_method, block_id, overlap_trace_json, consequential_json, provenance_json, reviewer_verdict, reviewer_note and status fields. | Existing issues remain readable through legacy columns such as block_idx and check_name. |
| 0003_matter_documents_versions | Create matter, document, document_version, block, clause, definition, document_comment, document_revision and document_capability; add indexes on version/id, unique local ID and text hash. | Backfill a legacy matter for old runs only; do not pretend old runs have a document version. |
| 0004_run_events_checkpoints_audit | Create run_event, run_checkpoint and audit_log; add run status, lease and last-event columns. | Existing completed runs get a synthetic legacy_imported event only if needed for UI; no fake tool trace. |
| 0005_contextual_commands | Create contextual_command, contextual_reference, action_proposal and companion_session; add idempotency index on matter and idempotency key. | No audio BLOB column. Raw transcript retention is configurable and auditable. |
| 0006_positions_precedent | Add a unique scope-aware position key, contradiction metadata and precedent_clause. | Fix the current find_position bug that ignores scope_key; preserve source issue IDs. |

### 6.3 Canonical table definitions

The following is the minimum v2 relational shape. id values are UUID text in
SQLite; the tenant deployment can map them to UUID columns.

~~~sql
matter(
  id, name, client, party_represented, counterparty, deal_type,
  governing_law, status, created_at, archived_at
)

document(
  id, matter_id, role, filename, word_doc_id, current_version_id, created_at
)

document_version(
  id, document_id, version_no, version_label, doc_hash, source,
  ingest_schema_version, capabilities_json, ingested_at, supersedes_id
)

block(
  id, document_version_id, idx, kind, text, text_sha256, list_prefix,
  list_level, style, style_built_in, story_type, table_id, row, col,
  section, footnote_ref, unique_local_id, char_start, char_end,
  structural_path_json
)

clause(
  id, document_version_id, number, kind, heading, start_idx, end_idx,
  depth, confidence, detected_by
)

definition(
  id, document_version_id, term, defined_at_idx, text,
  usage_idxs_json, scope
)

run(
  id, matter_id, document_version_id, mode, mandate_json, instruction,
  status, started_at, ended_at, engine_version, skill_version,
  model_roles_json, provider_provenance_json, tokens_in, tokens_out,
  cost_usd, steps_used, budget_json, lease_until, last_event_seq
)

run_event(
  id, run_id, seq, ts, event_type, payload_json, latency_ms,
  tokens_in, tokens_out, cost_usd
)

run_checkpoint(
  id, run_id, seq, state_json, plan_json, messages_hash, created_at
)

issue(
  id, run_id, document_version_id, block_id, local_id, ref, title,
  classification, severity, position, consequence, old_text, new_text,
  comment, evidence_tier, anchor_verified, anchor_method,
  overlap_trace_json, consequential_json, provenance_json,
  reviewer_verdict, reviewer_note, status
)

disposition(
  id, issue_id, actor, action, final_text, note, decided_at
)

position(
  id, scope, scope_key, topic, statement, polarity, evidence_count,
  confidence, contradiction_count, source_issue_ids_json, active,
  created_at, last_reinforced_at, user_edited
)

contextual_command(
  id, parent_id, matter_id, document_id, document_version_id,
  modality, activation, selection_json, raw_input_json, intent_json,
  references_json, status, run_id, idempotency_key, provenance_json,
  created_at, resolved_at, error_json
)

action_proposal(
  id, issue_id, command_id, operation, precondition_json,
  new_text, comment, risk, approval_status, applied_at, result_json
)

audit_log(
  id, ts, actor, matter_id, action, subject_type, subject_id, detail_json
)
~~~

All foreign keys are enabled. issue.block_idx remains in the legacy schema
until the compatibility period ends; new code writes both block_id and
block_idx.

## 7. Core module implementation plan

### 7.1 Request context and settings

Add agent/runtime/context.py (or agent/schemas/runtime.py) with an immutable
RequestContext:

~~~python
class RequestContext(BaseModel):
    request_id: UUID
    actor_id: str
    matter_id: UUID | None
    document_id: UUID | None
    document_version_id: UUID | None
    deployment_mode: Literal["local", "tenant"]
    provider_policy_id: str
    redaction_policy: str
    retention_policy: str
~~~

Every tool, model call, event, audit entry and store transaction receives this
context explicitly. No request may read the module-global cfg or router. The
old globals remain only as a local compatibility bootstrap until routes are
migrated.

### 7.2 Document package

First preserve behavior by moving the existing classes unchanged. Then:

- model.py owns normalized Block, Clause, Definition, Table, Comment, Revision
  and DocumentProjection.
- ingest.py accepts the add-in payload, validates parallel arrays and produces
  immutable blocks plus capability report.
- segment.py combines style, native list level and regex. It records confidence
  and detected_by; disagreements are exposed in outline output.
- definitions.py moves extraction, usage indexing and scope analysis out of the
  monolith.
- anchors.py owns the canonical resolution order:
  block_id -> unique_local_id -> scoped exact hash -> prefix/suffix structural
  candidate -> document-wide exact only with warning.
- Checks are split only after the current test_pipeline.py assertions have
  golden snapshots. Each runner returns typed IssueFinding values; the existing
  Issue remains an adapter.

### 7.3 Orchestrator extraction

agent/orchestrator/loop.py should initially be a near-mechanical extraction of
Supervisor.run:

1. create RunContext;
2. emit parsed;
3. resolve supervisor model through Gateway;
4. call plan;
5. execute tool calls;
6. append each event before yielding it;
7. checkpoint after each tool batch;
8. run independent reviewer;
9. run deterministic checks;
10. finish with complete/partial/failed status.

Do not change prompt methodology and mode behavior during this extraction.
Move mode briefs out of supervisor.py only after the same event sequence passes
contract tests. The legacy Supervisor.run should call the new executor and yield
the old event shapes.

### 7.4 Tool context and policy

Introduce:

~~~python
class ToolContext(BaseModel):
    request: RequestContext
    document: DocumentProjection
    matter_documents: list[DocumentProjection]
    run_id: UUID
    step_id: str
    allowed_document_version_ids: list[UUID]
    remaining_budget: Budget
~~~

Tool responses use:

~~~python
class Page[T](BaseModel):
    items: list[T]
    total: int
    shown: int
    truncated: bool
    next_cursor: str | None = None
~~~

The current offset pagination can remain as a wire-compatible field during
transition. New tools must never return a cut-off JSON preview as the only
answer. Oversized content becomes a page with a cursor and a provenance event.

record_issue becomes a typed policy gate. It validates:

- document version and block ID;
- exact quote hash and character limit;
- clause reference;
- evidence tier;
- overlap trace for new wording;
- consequence length and severity;
- allowed action type;
- provenance/tool-call IDs.

Rejections are structured tool results and budget events, not swallowed
exceptions.

### 7.5 Provider gateway and Agmt Standard

Keep OpenRouter as the first backend. Add a provider-neutral interface:

~~~python
class ProviderGateway(Protocol):
    def resolve(self, task: ModelTask, policy: ModelPolicy) -> ModelRoute: ...
    def chat(self, route: ModelRoute, messages: list[dict],
             tools: list[dict] | None, response_schema: dict | None) -> ModelResponse: ...
~~~

ModelRoute records model, provider, region, data-retention status, capability
flags, cost estimate and reason for selection. The OpenRouter adapter is the
current Router moved behind this interface.

Agmt Standard default policy:

- deterministic checks and indexed lookup run first;
- a cheap structured model handles intent parsing, topic classification and
  bounded extraction;
- a strong tool-capable model supervises legal synthesis and drafting;
- a separate strong model or independent provider reviews high-severity
  issues, new protections and ambiguous references;
- escalation occurs on high-risk action, conflicting candidate references,
  disagreement between workers, thin evidence or budget-aware confidence
  failure;
- no parallel model calls are used for a simple exact lookup;
- user-selected models override route preference only after capability,
  confidentiality and allowlist checks.

The first default can remain the existing family preference configuration. Do
not tune dynamic routing until the expanded corpus and cost/latency telemetry
exist.

## 8. Canonical HTTP APIs

The canonical v2 API uses the existing /api prefix. The old review endpoint is
kept as a compatibility adapter, not as the new execution contract.

### 8.1 Health, settings and model policy

| Method | Endpoint | Request | Response / rule |
|---|---|---|---|
| GET | /api/health | none | API version, deployment mode, schema version, supported Word requirement sets, capability flags, service status. Never returns secrets. |
| GET | /api/models | optional task/role | Allowlisted models, capabilities, resolved Agmt Standard routes and policy reasons. Do not expose the raw provider catalogue to the pane. |
| POST | /api/settings | admin/local settings | Saves non-secret preferences. API keys are not accepted from the normal Word pane in v2. |
| POST | /api/auth/pair | one-time local pairing proof | Returns short-lived session token; store only a token hash server-side. |

### 8.2 Matters and document versions

| Method | Endpoint | Request / response |
|---|---|---|
| GET | /api/matters | filters | Matter summaries visible to the actor. |
| POST | /api/matters | name, client, party, counterparty, deal type, governing law | Creates a matter and returns its ID. |
| GET | /api/matters/{matter_id} | none | Mandate, current documents, open issues, unresolved questions. |
| POST | /api/matters/{matter_id}/documents | Full-fidelity DocumentIngestRequest | Creates or deduplicates a document version; returns document/version IDs, hash, block counts, capability report and suppressed checks. |
| GET | /api/matters/{matter_id}/documents | none | Documents, roles, current versions and capabilities. |
| GET | /api/documents/{document_id}/versions | none | Version list and hashes, never full text by default. |
| GET | /api/documents/{document_id}/versions/{version_id}/outline | cursor | Version-scoped outline with clause confidence and detection method. |

Document ingestion is idempotent on document identity plus document hash.
The add-in can send the same snapshot again without producing duplicate
versions.

### 8.3 Contextual commands

| Method | Endpoint | Request / response |
|---|---|---|
| POST | /api/matters/{matter_id}/contextual-commands | ContextualCommandCreate with document/version snapshot, selection anchor and raw text | Returns command ID, status, normalized intent, reference candidates/ambiguities and run ID if ready. |
| GET | /api/contextual-commands/{command_id} | none | Current command, references, linked run and proposed actions. |
| POST | /api/contextual-commands/{command_id}/resolve | selected candidate IDs or clarification text | Re-resolves only the ambiguous mentions; never silently changes a resolved reference. |
| POST | /api/contextual-commands/{command_id}/follow-up | new raw input plus fresh selection/version snapshot | Creates a child command with parent ID; it does not reuse stale anchors. |

The command endpoint is the single entry point for voice, typing, palette,
context menu and ribbon interactions. A direct run remains available for
non-contextual full-document review.

### 8.4 Runs, events and actions

| Method | Endpoint | Request / response |
|---|---|---|
| POST | /api/matters/{matter_id}/runs | document_version_id, mode, mandate, instruction, command_id, budget profile | Returns 202 and run ID immediately. |
| GET | /api/runs/{run_id} | none | Status, plan, budget, provenance summary, current version and issue counts. |
| GET | /api/runs/{run_id}/events | Last-Event-ID or after cursor | Replayable SSE from run_event; event IDs are monotonically increasing per run. |
| POST | /api/runs/{run_id}/cancel | reason | Idempotently requests cancellation; worker checkpoints and emits cancelled. |
| GET | /api/runs/{run_id}/issues | filters/cursor | Issues with evidence, reviewer state and action availability. |
| POST | /api/issues/{issue_id}/disposition | accepted, accepted_modified, rejected, deferred, final_text, note | Records actor, timestamp and audit event; triggers position evidence only after validation. |
| POST | /api/actions/{action_id}/prepare | current version hash and optional fresh anchor | Revalidates the action precondition and returns an approval token or stale/ambiguous response. |
| POST | /api/actions/{action_id}/confirm | new version hash, Word result metadata | Records post-write verification and closes the action. |

The server never writes the Word document. The add-in obtains a prepared action,
re-reads the live range, asks for human approval, writes with Word tracking,
re-reads the result and confirms it.

### 8.5 Companion bridge

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/companion/sessions | Pair a signed companion instance with a Word/add-in session. |
| POST | /api/companion/sessions/{id}/events | Press, release, partial transcript, final transcript, cancel and error events. |
| DELETE | /api/companion/sessions/{id} | Revoke the session. |

The preferred P1 transport is a loopback WebSocket or localhost HTTPS bridge
with a short-lived pairing token. The bridge payload contains event metadata
and transcript text only. It does not accept document blocks or action writes.

### 8.6 Compatibility routes

Keep:

- POST /api/review: adapt the old ReviewRequest into an ephemeral matter,
  ingest a version, start a run and stream equivalent event names;
- POST /api/checks: run the deterministic engine synchronously and return the
  current response shape plus version and capability fields;
- GET /api/runs/{id}, POST /api/issues/{id}/disposition and GET /api/positions:
  accept the old response fields while adding v2 metadata.

Add deprecation headers and telemetry. Do not let new code depend on the
legacy endpoint's synchronous lifetime.

## 9. Word add-in implementation plan

### 9.1 Manifest changes

Update both add-in manifests:

- [addin/manifest.xml](https://github.com/Daaktor0/AgmtAgent/blob/main/addin/manifest.xml)
  and [catalog/manifest.xml](https://github.com/Daaktor0/AgmtAgent/blob/main/catalog/manifest.xml)
  must remain byte-level contract-tested copies or be generated from one source.
- Declare the minimum WordApi set needed for the baseline and use runtime
  capability checks for optional features.
- Add the shared runtime with a long lifetime and a FunctionFile/executeFunction
  surface.
- Add Home-tab commands for Open Agmt and Ask Agmt.
- Add the Word text context-menu command where the host supports the
  ContextMenuText extension point.
- Add the custom keyboard shortcut declaration only as an open/arm/fallback
  command. It is not a hold-to-talk implementation.
- Add the correct VersionOverrides version and ExtendedOverrides block for the
  supported shortcut model, then validate with Microsoft's manifest validator.

The manifest cannot make a Word web add-in receive arbitrary global key-down and
key-up events while Word is unfocused. It also cannot provide a reliable
non-focus-stealing desktop overlay. Those remain companion responsibilities.

### 9.2 Add-in file changes

Extract the current taskpane.js without changing behavior first:

1. Move readDocument and capability checks to ingest.js.
2. Move findRange, Go to, tracked replacement, deletion and comment insertion
   to apply.js.
3. Move selection capture to selection.js.
4. Move run/event subscription and reconnect logic to runtime.js.
5. Keep taskpane.js as the UI coordinator until the new UI has parity.

Then add:

- selection.js: capture current Range text, OOXML hash where available,
  paragraph local IDs, block span, prefix/suffix, story type, structural
  path, host/requirement-set diagnostics and a timestamp.
- ingest.js: body paragraphs plus style, list hierarchy, tables with cell
  coordinates, comments/replies, tracked revisions with before/current text
  where supported, headers/footers, footnotes and content controls.
- apply.js: resolve an action against the expected version, prefer block and
  unique-local-ID scope, reject duplicate/stale matches, turn on tracked
  changes, write once, sync, re-read and verify the resulting text.
- bridge.js: local companion pairing, event correlation, cancellation and
  fallback to typed/context-menu input.
- ui/result-card.js: evidence, related provisions, reviewer state, Go to,
  follow-up, minimum amendment, comment, tracked change and disposition
  actions.

### 9.3 Ingestion payload

The first request from the add-in should be a version snapshot, not a review
prompt containing loosely structured arrays:

~~~json
{
  "document": {
    "word_doc_id": "optional-host-identity",
    "filename": "agreement.docx",
    "role": "primary"
  },
  "snapshot": {
    "doc_hash": "sha256-of-canonical-payload",
    "ingest_schema_version": "2.0",
    "capabilities": {
      "WordApi": "1.6",
      "comments": true,
      "tracked_changes": true,
      "tables": true,
      "headers_footers": false,
      "footnotes": false,
      "content_controls": true
    },
    "blocks": [],
    "comments": [],
    "revisions": [],
    "selection": null
  }
}
~~~

When an API set is unavailable, the add-in sends false and a reason. The
server records a suppressed-check row. It must not send an absent property
that looks like an empty, successfully-ingested collection.

### 9.4 Word result surface

Use three surfaces with strict roles:

- task pane: durable result, evidence, issue list, follow-up, approval and
  dispositions;
- compact anchored selection strip in the pane: what is selected and what
  references were resolved;
- native companion overlay: listening, partial transcript, cancellation and
  microphone/error state only.

Do not attempt to place arbitrary HTML cards inside the Word document. Use
Word comments and tracked changes only for approved, verified actions.

## 10. Contextual Command and reference resolution

### 10.1 Safe command pipeline

~~~mermaid
sequenceDiagram
    participant W as Word
    participant I as Input layer
    participant G as Command gate
    participant H as Agmt Standard
    participant U as Lawyer
    W->>I: selection and activation
    I->>G: raw text or final transcript
    G->>G: intent and reference resolution
    G->>H: version-bound command
    H->>U: evidence-led result
    U->>W: approved, verified action
~~~

The sequence is:

1. Capture the selection at activation, not after transcription. The selection
   envelope and exact selected text are immutable for that command.
2. Receive text from any modality. Voice is only a producer of RawInput.
3. Parse objective and output request into IntentSpec.
4. Resolve references deterministically and show ambiguity before legal
   analysis or drafting.
5. Validate document/version identity and command idempotency.
6. Enter the existing supervisor/tool/reviewer state machine.
7. Render evidence and proposed actions in the pane.
8. Require human approval for a write.
9. Re-ingest or re-read the live Word range, apply tracked change/comment,
   verify the result and record the audit event.

### 10.2 Reference resolution rules

| Phrase | First resolver | Required fallback | Stop condition |
|---|---|---|---|
| this, this language, selected wording | SelectionAnchor captured from Word | None; use exact selected range | Empty or changed selection |
| clause above/below | Block order and outline around selected block | Heading/number index | More than one structural interpretation |
| the indemnity clause | Exact heading/alias index | Bounded concept search over clause headings and text | Multiple materially plausible clauses |
| definition of Losses | Definition index | Case-normalized exact term lookup | No definition; return not found, do not invent |
| where else does this operate | Selected text and definition use-site index | Concept search plus overlap tool | Empty/large result set must paginate |
| compare this with the investor consent right | Source is selection; target is exact concept/heading resolver | Bounded candidate list | Target ambiguity |
| make this consistent with the limitation clause | Source selection; target limitation heading/term index | Search and supervisor candidate choice | No unique target |
| this should only apply to the Promoters | Party/defined-term index plus intent constraint | Supervisor interprets scope after exact party candidates | Party identity ambiguous |
| delete this everywhere else | Enumerate exact and semantic occurrences | Supervisor classifies candidates | Never auto-write; requires explicit multi-action approval |

Resolution order:

1. deterministic selection and structural rules;
2. exact clause, heading, definition and party indexes;
3. bounded lexical/concept retrieval;
4. supervisor chooses only among candidate IDs and states the choice;
5. ambiguity response with candidates and navigation links.

The model may rank candidates. It may not manufacture a clause reference,
definition location or action anchor. Every resolved reference stores resolver
type, candidate set, score and source version.

### 10.3 Agmt Standard entry for the example command

For “Check this language against the indemnity clause and tell me whether it
creates any double-recovery issue”:

1. Word captures the selected language and its anchor.
2. Intent resolver produces objective check and output answer.
3. “This language” resolves to the selection.
4. “The indemnity clause” resolves to a heading/outline candidate. If there
   are two indemnity provisions, the pane asks the lawyer to choose.
5. Agmt Standard receives the selection block and indemnity clause reference.
6. The supervisor plans exact reads, definition/use lookup, search for other
   remedies, overlap analysis and relevant deterministic checks.
7. Workers may inspect bounded related provisions in parallel; the supervisor
   reconciles them.
8. The reviewer re-reads the selected language, indemnity clause and cited
   remedy evidence. It does not merely inspect the supervisor's prose.
9. The result shows answer, contractual hooks, related provisions and any
   minimum amendment. No Word write is offered unless drafting was requested.

## 11. UX state machine

| State | Entry | Visible UI | Allowed actions | Exit |
|---|---|---|---|---|
| idle | pane/runtime loaded | Agmt command affordance; no interruption | Select, type, context menu, ribbon, open companion | selection_made or command_palette |
| selection_made | non-empty Word selection | compact selected-text preview and “Ask Agmt” affordance | type, click, hold shortcut, change selection | activation_pressed or selection_cleared |
| activation_pressed | companion press or command invocation | small listening/arming indicator | release, cancel | listening or idle |
| listening | microphone open | transient overlay: level, elapsed time, cancel | speak, release, cancel | live_transcript, cancelled, mic_error |
| live_transcript | partial STT events | partial text; no legal result yet | continue, release, cancel | release_received |
| release_received | final text | transcript editable for a short confirmation window | edit, send, cancel | resolving |
| resolving | command persisted | “Resolving selection and references”; selection strip | choose ambiguous candidate, cancel | working, ambiguity, stale, error |
| working | run active | plan/progress and evidence-aware status | stop, continue in background | contextual_result, waiting_user, failed |
| contextual_result | run complete | answer first, evidence, related provision links, reviewer stamp | follow up, show amendment, add comment, dismiss | proposing_draft or idle |
| proposing_draft | action prepared | minimal old/new text and anchor status | approve, edit, reject | approval or idle |
| approval | explicit human decision | expected version and exact target shown | approve once, cancel | inserting or idle |
| inserting | Word write in progress | “Applying tracked change/comment” | no second write | verified, stale, error |
| verified | post-write read confirms | success, new text and audit/disposition controls | undo through Word, dismiss | idle |
| ambiguity/error | unresolved or failed | plain reason, candidates/retry/fallback | choose, edit, retry, use pane | resolving, idle |

The task pane is the durable surface for states from resolving onward. A native
overlay exists only for listening and short progress acknowledgement.

## 12. Latency budget

Target for a warm Windows desktop path and a normal selected clause:

| Segment | Target | Concurrency/cache |
|---|---:|---|
| Press acknowledgement | under 150 ms | Companion emits immediately; add-in captures selection concurrently. |
| Selection snapshot | 100–300 ms | Load selected range, local IDs and OOXML hash in one Word sync where possible. |
| First partial transcript | 150–300 ms after speech | Local streaming STT; show partial only. |
| Final transcript | 200–900 ms after release | Keep model warm; no audio upload in the default path. |
| Intent parse | 150–500 ms | Cheap structured route; cache mode schema and command vocabulary. |
| Reference resolution | 100–800 ms | Exact indexes first; parallel heading/definition searches; semantic search only if needed. |
| Version gate and ingest lookup | 100–400 ms | Cache document projection/index by version hash. |
| Simple deterministic answer | 0.5–2 s after transcript | No model if exact check/index can answer. |
| Normal legal analysis | 3–6 s after transcript | Read selected and target provisions in parallel; stream progress. |
| High-risk analysis/reviewer | 6–12 s after transcript | Add overlap, independent reviewer and escalation only when risk requires it. |

Never cache a legal result across a document-version hash. Cache only:

- normalized document projection, outline and definition indexes;
- capability report;
- model catalogue and route policy;
- static prompt prefix/provider cache directives;
- matter position summaries keyed by scope and topic.

## 13. Tests and evaluation

The current repository uses executable Python test scripts. Add pytest as a
development dependency for the larger suite, but keep the two current scripts
running until CI migration is complete.

### 13.1 P0 test layers

1. **Migration tests**
   - empty database applies every migration;
   - current v1 database upgrades without losing run, issue, disposition or
     position rows;
   - migrations are idempotent;
   - checksum mismatch stops startup;
   - foreign-key and unique constraints behave as designed.

2. **Schema/serialization tests**
   - valid and invalid document, anchor, command, issue and action payloads;
   - no audio field is persisted by default;
   - old ReviewRequest maps to the v2 request envelope.

3. **Document projection tests**
   - paragraphs, native list prefixes/levels, styles and regex fallback;
   - tables with row/column coordinates;
   - comments and replies;
   - tracked changes with insertion/deletion/format/move and before/current
     text where the host provides it;
   - headers, footers, footnotes and content controls;
   - capability suppression is explicit and never mistaken for clean.

4. **Anchor tests**
   - block ID and unique local ID resolution;
   - scoped exact match;
   - duplicate exact text;
   - stale document hash;
   - quote/hash mismatch;
   - smart quote and formatting-run differences;
   - document-wide fallback requires warning/confirmation;
   - post-write text verification and idempotent retry.

5. **Check and issue-policy tests**
   - one golden fixture per registered check;
   - registry IDs, versions, families and suppressed requirements;
   - record_issue rejects every existing bad case;
   - new wording without overlap trace is rejected;
   - tier 3 cannot produce a write action;
   - provenance is present on every recorded issue.

6. **Provider and routing tests**
   - allowlisted model/provider only;
   - no arbitrary fallback;
   - pinned model capability validation;
   - normalized tokens, cost, provider, region and retention metadata;
   - retry/circuit behavior does not duplicate a tool call;
   - user-selected model can be overridden only for an explicit policy reason.

7. **Orchestrator tests**
   - valid state transitions;
   - plan is first;
   - event order is stable;
   - checkpoint after tool batch;
   - restart resumes from last checkpoint;
   - cancellation is idempotent;
   - budget exhaustion produces a partial result, not a truncated silent result;
   - parallel worker outputs reconcile deterministically;
   - reviewer never receives or relies on an unverified quote.

8. **API contract tests**
   - OpenAPI snapshot;
   - idempotent document ingestion;
   - 202 run creation;
   - SSE replay from Last-Event-ID;
   - reconnect after worker restart;
   - cancel and disposition authorization;
   - stale action prepare returns 409-style structured response;
   - local pairing token, expiry, revocation and origin checks.

### 13.2 Contextual Command tests

Create a fixture table with natural-language commands and expected structured
outputs:

- “check this”;
- “check this against the indemnity clause”;
- “compare this with the investor consent right”;
- “where else does this operate?”;
- “the definition of Losses”;
- “make this consistent with the limitation clause”;
- “this should only apply to the Promoters”;
- “delete this everywhere else”.

Each fixture asserts:

- intent objective and requested output;
- mentions and categories;
- deterministic resolution method;
- candidate count;
- ambiguity status;
- document/version IDs;
- whether a write is allowed.

Add adversarial fixtures where two clauses share a heading, the selected text
is empty, the document changes after selection, “indemnity” is used only in a
defined term, or “above” crosses a table boundary.

### 13.3 Add-in tests

Extract pure functions so they can be tested outside Office:

- selection envelope hashing;
- capability negotiation;
- payload normalization;
- event reducer;
- SSE parser/reconnect;
- anchor candidate ordering;
- stale action rejection.

Use a fake Office/Word object for unit tests. Add a host matrix for Windows
desktop Word, Mac desktop Word and Word Online covering WordApi 1.3, 1.4,
1.5 and 1.6 availability. The host matrix should be a release gate for
ingestion claims, not an assumed CI capability.

Manual/host smoke tests must verify:

- Home command opens the pane;
- context-menu command sees the selected range;
- shared runtime survives pane navigation;
- selection is captured before a companion release;
- comments and tracked changes are inserted only after approval;
- Word undo reverses the change;
- a stale version blocks the write.

### 13.4 Companion tests

The separate companion needs its own tests:

- press -> listening -> release state machine;
- repeated press/release and cancellation;
- shortcut collision and rebind;
- microphone permission denied;
- audio buffer disposal;
- local STT partial/final ordering;
- bridge authentication and reconnect;
- no document payload accepted;
- signed installer/update verification.

### 13.5 Evaluation expansion

Expand the current corpus before changing dynamic routing:

- at least 20–30 labelled agreements;
- Indian venture/PE SSAs, SHAs, SPAs and disclosure letters;
- MSA/SaaS examples and a few US/UK documents;
- at least three clean documents;
- deliberate traps that are commercially intended;
- selection/transcript/reference-resolution labels for contextual commands.

Retain the existing gates and add:

- severity calibration;
- stability/Jaccard across repeated runs;
- p50/p95 latency by command type;
- cost per run and cost per contextual command;
- reference-resolution precision/ambiguity rate;
- stale-write prevention rate.

## 14. Sequencing and incremental commits

Every commit below must pass the tests listed in its exit criterion and should
be independently revertible. The titles are proposed commit messages, not
changes made in this planning task.

### Phase 0 — lock the current behavior and safety boundary

| # | Proposed commit | Scope | Exit criterion |
|---:|---|---|---|
| 1 | test: freeze v1 contract snapshots | Add current event, issue, mechanical finding, settings and add-in payload snapshots. | Existing test_pipeline.py, test_eval_run.py and deterministic CI remain green. |
| 2 | feat: add typed schemas and API error envelopes | Add agent/schemas, validation errors, pagination and version/hash helpers. | Old endpoints serialize through adapters; invalid payloads fail deterministically. |
| 3 | feat: add SQLite migration runner with legacy baseline | Add migration ledger, backup, 0001 and 0002; replace Store startup schema creation. | Current v1 DB upgrade test passes with all rows preserved. |
| 4 | security: add request context and local pairing | Add auth.py, immutable request context, token hash/expiry, origin checks and audit hooks. | Unpaired local requests fail; legacy tests use an explicit test token. |
| 5 | feat: persist run events and checkpoints | Add run_event/run_checkpoint repositories and append events from the compatibility Supervisor. | Closing the SSE client does not lose the persisted event stream. |
| 6 | security: move secrets behind credential-store adapter | Convert config.py to config package; add keyring/OS-store adapter, plaintext migration warning and provider policy. | No new API key is written to config.yaml; existing key is migrated or startup is explicit about failure. |
| 7 | feat: add provider gateway and usage provenance | Move OpenRouter HTTP code behind gateway/openrouter; normalize usage/cost/provider metadata. | Stub-router tests prove fail-closed selection and complete provenance. |

### Phase 1 — preserve and strengthen the deterministic engine

| # | Proposed commit | Scope | Exit criterion |
|---:|---|---|---|
| 8 | refactor: turn document.py into a package façade | Git-move document.py to document/__init__.py; no behavior change. | All current imports and golden document tests pass. |
| 9 | refactor: split document projection and segmentation | Add model.py, ingest.py and segment.py; retain legacy constructors. | Existing corpus findings are byte-for-byte equivalent unless a fixture is deliberately versioned. |
| 10 | feat: complete versioned check registry | Move check runners, add explicit check context, suppressions and typed findings. | Every registry entry has a fixture, version and precision target. |
| 11 | feat: enforce issue evidence and provenance contract | Add block/version anchor fields, overlap trace, consequential refs and record-time invariants. | anchor_pass_rate and overlap_compliance are 1.00 on the corpus. |
| 12 | feat: make reviewer re-read cited evidence | Reviewer receives exact evidence blocks, overlap trace and source version, not just compact issue prose. | Reviewer can drop an issue because its source evidence is absent or contradictory. |

### Phase 2 — full Word fidelity and safe writes

| # | Proposed commit | Scope | Exit criterion |
|---:|---|---|---|
| 13 | feat: add matter/document/version migrations | Apply 0003 and repository methods; add document ingest service. | Same document hash is idempotent; new version gets immutable blocks and indexes. |
| 14 | refactor: extract Word ingestion module | Add addin/ingest.js and capability report; taskpane delegates to it. | Existing pane behavior remains; fixture payload contains all supported fields. |
| 15 | feat: ingest tables, revisions, comments and optional stories | Add table cell anchors, comment threads, before/current revisions, headers/footers/footnotes/content controls where host supports them. | Suppressed checks and degraded capabilities are visible in the pane. |
| 16 | feat: add version-safe Word action protocol | Add addin/apply.js, action_proposal, prepare/confirm endpoints and post-write verification. | No stale/duplicate/ambiguous action can write; Word undo remains correct. |
| 17 | feat: replace synchronous review path with durable runs | Add runner/worker, canonical run routes, SSE replay and cancellation; retain legacy adapter. | Pane close, service restart and reconnect recover a run without duplicate tool calls. |

### Phase 3 — Contextual Command without voice dependency

| # | Proposed commit | Scope | Exit criterion |
|---:|---|---|---|
| 18 | feat: add contextual command schemas and resolver | Add contextual/interpreter/resolver/policy/thread, command tables and command endpoints. | Resolver fixtures pass; ambiguity is surfaced and never silently guessed. |
| 19 | feat: add shared runtime and Word command surfaces | Update manifest and catalog manifest; add runtime.js/commands.js, Home command, text context menu and keyboard fallback. | A typed command can start a version-bound run from a selection without opening a new workflow. |
| 20 | feat: add selection-aware task pane result flow | Add selection strip, command input, follow-up, anchored result cards and navigation. | The example command works from selection to evidence card using typed text only. |
| 21 | feat: add matter tools and cross-document run context | Promote current matter.py behavior into persisted list/search/compare/check tools. | SSA/SHA/disclosure fixture finds a cross-document labelled defect. |

### Phase 4 — native push-to-talk

| # | Proposed commit | Scope | Exit criterion |
|---:|---|---|---|
| 22 | feat: define companion bridge protocol | Add protocol, pairing/session endpoints and addin/bridge.js; no speech engine yet. | A fake companion can emit press/release/cancel/partial/final events and the add-in produces the same Contextual Command as typed input. |
| 23 | feat: add Windows signed push-to-talk companion | Separate companion artifact: global shortcut, key-down/key-up, VAD, local STT, cancellation, transient overlay and bridge. | Handy-style state-machine tests pass; no document content is accepted by the bridge; signed installer smoke test passes. |
| 24 | feat: add local streaming transcript UX | Partial transcript events, final transcript edit/confirm window, low-confidence warning and typed fallback. | Warm release-to-command latency meets target without a network audio round trip. |

### Phase 5 — memory, precedent and enterprise mode

| # | Proposed commit | Scope | Exit criterion |
|---:|---|---|---|
| 25 | feat: make dispositions actor- and scope-aware | Fix position scope key, add contradiction handling, Positions management API/UI and audit. | Repeated accept/reject decisions promote or suppress only within the intended scope. |
| 26 | feat: add matter memory and precedent metadata | Add prior-run context, local precedent retrieval and provenance; no automatic drafting from precedent. | A follow-up run carries forward settled facts and shows precedent provenance. |
| 27 | feat: add sectioned skill loading and route profiles | Split locked core, mode and playbook; add cache directives and Agmt Standard route evaluation. | Prompt token and cost reduction is measured without recall/precision regression. |
| 28 | feat: add tenant provider gateway and operational exports | Optional Postgres/tenant mode, hosted auth, SSO boundary, exports and audit export. | Enterprise deployment can use an approved customer endpoint without changing core schemas. |

### 14.1 Dependency graph

~~~text
contract snapshots
  -> schemas/errors
  -> migrations/request context/auth
  -> events/checkpoints/provider provenance
  -> document package/check evidence
  -> versioned Word ingestion
  -> safe Word actions
  -> durable async runs
  -> contextual command/resolver
  -> typed Word command surfaces
  -> companion bridge
  -> signed local STT
  -> memory/precedent
  -> tenant/commercial
~~~

The only intentional cross-phase shortcut is typed Contextual Command after the
anchor/version model is stable. It does not wait for native voice and it does
not bypass the existing Agmt Standard loop.

## 15. Build priorities

### P0 — foundational

- Migration-backed Store with legacy upgrade tests.
- Request-scoped configuration, local pairing and secret-store adapter.
- Provider allowlist, fail-closed routing and usage/provenance capture.
- Document/version/block model and capability negotiation.
- Full evidence and issue invariants.
- Durable event/checkpoint ledger and resumable run API.
- Version-safe Word anchor/apply protocol.
- Expanded deterministic corpus and CI gates.
- Typed Contextual Command for selection plus typed input/context menu.

P0 completion means a lawyer can select text, type a contextual request,
receive a resumable evidence-led result, navigate to cited provisions and
apply a human-approved tracked change safely. It does not require voice.

### P1 — substantial improvement

- Word headers/footers/footnotes/content controls and richer revision/comment
  fidelity.
- Matter/document roles and cross-document tools.
- Independent reviewer evidence re-read.
- Shared runtime polish, follow-ups and ambiguity cards.
- Companion protocol and Windows push-to-talk with local STT.
- Local STT vocabulary/hotword handling for defined terms and party names.
- Positions screen and scope-aware disposition promotion.

### P2 — advanced

- Dynamic cost/quality routing learned from the evaluation corpus.
- Independent multi-model examination for selected high-risk issue classes.
- Local precedent embeddings and matter-level memory.
- macOS companion and signed cross-platform packaging.
- N-best transcript correction tied to the current document vocabulary.
- Tenant providers, SSO, licensing and centralized deployment.

### Avoid or defer

- A separate voice agent with its own legal memory or tool loop.
- Realtime conversational voice as a product goal.
- Temporal/LangGraph adoption before the SQLite state machine demonstrates a
  real need.
- Embedding every document before exact indexes, definitions and outline
  resolution are reliable.
- A model call for every selection or every “where else” request.
- Direct Word COM automation from the companion.
- Silent document-wide search fallback for writes.
- Storing raw audio by default.
- Automatic promotion of a position from one disposition or one matter.
- Result caching across document-version changes.

## 16. Architectural and operational risks

| Risk | Why it can make legal review worse | Control in the plan |
|---|---|---|
| More agents create more noise | Parallel workers can produce several plausible but duplicate concerns. | Deterministic/indexed fast path; bounded delegation; supervisor deduplication; independent reviewer only when risk justifies it. |
| Resolver guesses a reference | A polished answer against the wrong indemnity or definition is more dangerous than an explicit question. | Candidate IDs, ambiguity state, deterministic-first resolution and no model-invented refs. |
| Stale Word anchor | A tracked change can land on a repeated phrase or wrong paragraph after editing. | Version hash, block/local-ID scope, exact quote hash, prepare/confirm, post-write verification and no silent fallback. |
| Partial Word fidelity | A QC result that ignores comments, revisions, tables or footnotes looks like a clean bill of health. | Capability report, persisted degraded state and suppressed-check UI. |
| Reviewer shares supervisor bias | A reviewer that sees only the same prose may rubber-stamp it. | Independent model call, fresh evidence reads and reviewer provenance. |
| Cost/latency escalation | Dynamic routing can make ordinary contextual questions slow and expensive. | Deterministic fast path, budget policy, task complexity gate and measured route changes. |
| Durable transcript exposure | Spoken privileged instructions may be retained in logs or provider prompts. | Local STT by default, ephemeral audio, configurable transcript retention, redacted telemetry and audit access controls. |
| Companion compromise | A compromised native process could impersonate the user or observe microphone data. | Code signing, least-privilege process, short-lived pairing token, authenticated bridge, no document/write capability and signed updates. |
| Prompt injection in document text | Agreement text may contain instructions that try to control the model. | Treat document blocks as untrusted data; tool policy and system instructions remain outside document content. |
| Shared mutable state | Current module-global cfg/router can leak settings or credentials between users. | RequestContext, dependency injection, immutable settings and tenant-scoped stores. |
| Migration damage | SQLite schema changes can destroy the only local audit history. | Backup, checksums, idempotent migrations, upgrade fixtures and no destructive reset path. |
| Word host divergence | Word desktop, Mac and web expose different requirement sets. | Capability negotiation, host matrix and explicit local-mode/Word Online support boundary. |
| UI interruption | A large pane or overlay pulls the lawyer away from the clause. | Selection strip plus pane result; overlay only for listening; no in-document HTML cards. |

## 17. Definition of done for v2.0

The first credible v2 release should not be declared complete until all of the
following are true:

- Current v1 tests and corpus checks remain green.
- A v1 SQLite database upgrades without data loss.
- Every run has a durable status, event sequence, usage/cost record and
  provider provenance.
- A run resumes after pane close and service restart.
- Every model issue has a document version and provenance.
- Every proposed edit has an exact quote, verified anchor, overlap trace and
  action precondition.
- Stale or ambiguous Word actions cannot write.
- A capability-degraded document visibly reports suppressed checks.
- The contextual command fixtures meet the reference-resolution target.
- Typed selection-aware commands work without the native companion.
- The example indemnity/double-recovery request reaches the normal Agmt
  Standard evidence loop and returns related-provision navigation.
- Human approval is required before every tracked change or comment.
- The expanded corpus reports anchor_pass_rate 1.00 and
  overlap_compliance 1.00, with precision/recall/noise/latency/cost metrics
  visible in CI artifacts.

Native push-to-talk should be called v2.1 or later unless the companion passes
the same security and host-compatibility gates. Voice is an interaction
accelerator; it is not a reason to weaken the evidence or write controls.

## 18. Immediate next planning artefacts before coding

Create these as design/test fixtures before the first implementation commit:

1. A current-branch contract snapshot covering the event stream, issue payloads,
   mechanical findings, settings and Word payload.
2. A legacy SQLite database fixture produced by the current Store.
3. A 20-document corpus intake sheet with labels, traps, clean examples and
   expected references.
4. A Word host capability matrix for Windows desktop, Mac desktop and Word
   Online.
5. A Contextual Command fixture file with selection, transcript, mentions,
   candidates, ambiguity and expected action policy.
6. A companion bridge protocol document with event schemas, authentication,
   retention and failure behavior.
7. A release checklist that requires current tests, migration upgrade,
   manifest validation, API contract tests, anchor tests and Word host smoke
   tests.

Once those artefacts exist, commit 1 can freeze the current behavior and the
remaining plan can be executed without changing the architecture again.
