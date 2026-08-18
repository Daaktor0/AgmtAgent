# Agreement Agent v2 — Engineering Specification

**Status:** Draft for build · **Baseline:** v1 as at 18 August 2026 · **Goal:** best-in-market agreement review

This spec is written against the v1 codebase. Every "changes from v1" note has been verified
against the actual files. Phases are ordered by dependency, not calendar.

---

## 0. Product thesis

Every competitor in this category — Spellbook, LegalOn, Legora, Harvey, Luminance, Ivo — sells
*plausibility*. A model reads a contract and produces confident-looking findings, and the lawyer
has no way to tell which ones are load-bearing. The failure modes are consistent across the
category: invented quotations, flag floods that train users to ignore the panel, clause-by-clause
review that misses how a document works as a system, and no cross-document capability at all.

**v2 sells verifiability.** Every finding carries a stated evidence tier, a paragraph anchor, and
the trail of tool calls that produced it. Deterministic findings are provable. Model findings are
either anchored to verbatim text or explicitly labelled as judgement. This is not a marketing
posture — it is enforced in code at the point of recording, and it is measured on a published
benchmark.

### The five claims v2 must be able to defend

| # | Claim | Measured by |
|---|---|---|
| 1 | No proposed edit ever quotes text that isn't in the document | `anchor_pass_rate == 1.00`, hard-enforced |
| 2 | It surfaces the defects that matter and doesn't flood you | `recall@must_find ≥ 0.90`, `noise_rate` under ceiling |
| 3 | It reasons about the document as a system, not a clause list | `overlap_compliance == 1.00` on protection proposals |
| 4 | It reviews the transaction, not one file | Matter-level modes; cross-document check family |
| 5 | You can see exactly why it said what it said | Provenance record on 100% of issues |

Claims 1, 3 and 5 are enforced invariants, not model behaviour. That distinction is the product.

### Non-goals

Explicitly out of scope, so they don't creep in: contract lifecycle management (repository,
obligation tracking, renewals), e-signature, legal research, Google Docs (see v1 README reasoning —
no true tracked-changes API), general-purpose chat over documents, and litigation/disclosure review.

---

## 1. Architecture

### 1.1 Target module map

```
agent/
  config/
    settings.py         profiles, deployment mode, feature flags
    secrets.py          OS credential store (keyring); no secrets on disk
    providers.yaml      allowlist — models, providers, regions, ZDR flags
  document/
    model.py            Document, Block, Clause, Definition, Table, Comment, Revision
    ingest.py           normalise the add-in payload into Blocks
    segment.py          structure detection: style + list level + regex, with confidence
    definitions.py      extraction, usage indexing, scope resolution
    checks/
      registry.py       versioned check registry, precision targets
      structure.py  defterms.py  amounts.py  dates.py  parties.py
      execution.py  crossdoc.py
  orchestrator/
    loop.py             the supervisor loop
    plan.py             explicit plan/replan
    budget.py           step, token and cost ceilings with graceful degradation
    prompt.py           sectioned skill assembly + provider cache directives
    delegate.py         worker fan-out, incl. parallel batch
    reviewer.py         second-pass QC over recorded issues
  memory/
    store.py            SQLite schema + migrations
    dispositions.py     capture accept/reject/edit
    positions.py        learned house positions
    precedent.py        clause bank, local embeddings, retrieval
  providers/
    gateway.py          allowlist enforcement, fail-closed, provenance logging
    openrouter.py  azure_openai.py  bedrock.py  vertex.py  local_openai.py
  tools.py              schemas + dispatch + record-time policy enforcement
  eval/
    harness.py  corpus.py  metrics.py  report.py
server/
  app.py                ASGI app, deployment-mode aware
  auth.py               local pairing token / hosted session auth
  routes/               matters, documents, runs, issues, positions, precedent, exports, audit
addin/
  ingest.js             full-fidelity Word extraction
  apply.js              anchored insertion (uniqueLocalId first, search fallback)
  ui/                   pane, issue cards, plan view, positions manager
skill/
  core/                 methodology — locked, ships with product
  modes/                one file per mode, loaded on demand
  playbook/             customer-editable positions layer
```

### 1.2 Changes from v1, and why

| v1 | v2 | Reason |
|---|---|---|
| `agent/document.py` — one 542-line module | `agent/document/` package with a versioned check registry | Checks must be individually versioned and individually scored on the benchmark |
| `agent/supervisor.py` holds modes + loop + prompt | `orchestrator/` split; modes move to `skill/modes/` | Sectioned prompt loading; a 4,500-word skill is sent on every one of up to 40 calls today |
| `Router` → OpenRouter only | `providers/gateway.py` with pluggable backends | Enterprise sale requires model calls inside the customer's tenant |
| `Toolbox` issues held in memory, discarded | `memory/store.py`, SQLite | Audit trail, learning signal, metering and resumable runs all need it |
| Global mutable `cfg`, single `Router` | Per-request context object | Two users currently corrupt each other's settings |
| Key in `config.yaml` plaintext | OS credential store | Fails IT review on sight |

### 1.3 Deployment modes

The core must be deployment-agnostic. Same code, two shapes, selected by config:

- **`local`** — service runs on the lawyer's machine, documents never leave it except in the model
  call. Add-in pane is served from a public HTTPS origin (AppSource requirement) and talks to
  `https://127.0.0.1:8787` with a pairing token.
- **`tenant`** — service runs in the customer's own cloud (container image), model calls go to their
  Azure OpenAI / Bedrock deployment. Multi-user, SSO.

> **⚠ Architectural risk that must be designed around.** Chrome 142+ enforces a
> `local-network-access` Permissions Policy. Office Online embeds add-ins in iframes *without* that
> policy, so a hosted pane calling `localhost` is **blocked outright in Word Online on Chrome**, with
> no user-grantable prompt. Desktop Office is unaffected today because it does not iframe the pane,
> and Edge has not yet enforced. Consequences for this spec: (a) `local` mode is **desktop-Word only**
> and must detect and message that clearly; (b) `tenant` mode is the only route to Word Online; (c)
> do not build anything that assumes the local service is reachable from a browser context.

---

## 2. Data model

SQLite in `local` mode, Postgres in `tenant` mode. Same schema, migrations via a single versioned
migration chain.

```sql
matter(id, name, client, party_represented, counterparty, deal_type,
       governing_law, seat, created_at, archived_at)

document(id, matter_id, role, filename, word_doc_id, current_version_id, created_at)
  -- role: primary | counterpart | disclosure_letter | side_letter | precedent | ancillary

document_version(id, document_id, version_no, version_label, doc_hash,
                 ingested_at, source, ingest_schema_version)

block(id, document_version_id, idx, kind, text, list_prefix, list_level, style,
      table_id, row, col, section, footnote_ref, unique_local_id, char_start, char_end)
  -- kind: paragraph | heading | list_item | table_cell | header | footer
  --     | footnote | endnote | content_control | textbox

comment(id, document_version_id, block_idx, thread_id, parent_id, author,
        created_at, text, resolved)

revision(id, document_version_id, block_idx, type, author, date,
         text_before, text_after)
  -- type: insertion | deletion | format | move

clause(id, document_version_id, number, kind, heading, start_idx, end_idx,
       depth, confidence, detected_by)
  -- detected_by: style | list | regex | hybrid

definition(id, document_version_id, term, defined_at_idx, text,
           usage_idxs_json, scope)

run(id, matter_id, mode, mandate_json, instruction, status,
    started_at, ended_at, engine_version, skill_version,
    model_roles_json, provider_provenance_json,
    tokens_in, tokens_out, cost_usd, steps_used, budget_json)

run_event(id, run_id, seq, ts, event_type, payload_json, latency_ms,
          tokens_in, tokens_out, cost_usd)

issue(id, run_id, document_version_id, ref, block_idx, title,
      classification, severity, position, consequence,
      old_text, new_text, comment,
      evidence_tier, anchor_verified, anchor_method,
      overlap_trace_json, consequential_json, precedent_ref_id,
      provenance_json, reviewer_verdict, reviewer_note)

disposition(id, issue_id, action, final_text, note, decided_at)
  -- action: accepted | accepted_modified | rejected | deferred

position(id, scope, scope_key, topic, statement, polarity,
         evidence_count, confidence, source_issue_ids_json,
         active, created_at, last_reinforced_at, user_edited)
  -- scope: global | deal_type | counterparty | matter
  -- polarity: prefer | avoid | never_propose

precedent_clause(id, source_document_id, topic, ref, text, embedding,
                 deal_type, party_side, executed, executed_at,
                 survived_negotiation, tags_json)

audit_log(id, ts, actor, action, subject_type, subject_id, detail_json)
```

**`disposition` is the most valuable table in the product.** It is the only place where the
lawyer's judgement is captured as structured data, and it feeds both the learning loop (§7) and the
evaluation loop (§8). Design it before anything that depends on it.

---

## 3. Ingestion — full document fidelity

### 3.1 The v1 gap

`readParagraphs()` in `addin/taskpane.js` loads `document.body.paragraphs` with `items/text` plus
list numbering. That is the entire input. Consequences, all verified:

- **Word comments are invisible.** Mode N instructs the agent to check "unresolved comments." It
  cannot. That mode currently makes a promise it cannot keep.
- **Tracked changes are invisible.** Mode F is "counterparty markup review" and never sees what
  changed — only the current text state.
- **Tables lose their shape.** Cell paragraphs arrive flat, with no row/column relationship.
  Warranty schedules, CP lists, cap tables and disclosure schedules are exactly where pre-signing
  defects hide.
- **Headers, footers and footnotes are excluded** — `body.paragraphs` does not reach them. Execution
  blocks and footnoted carve-outs are invisible.

### 3.2 Required extraction

| Source | Word JS API | Requirement set | Fallback if unsupported |
|---|---|---|---|
| Body paragraphs | `body.paragraphs` (`text`, `style`, `styleBuiltIn`) | 1.1 / 1.3 | — |
| List numbering | `paragraph.listItemOrNullObject.listString` | 1.3 | regex on leading token (v1 behaviour) |
| Stable anchor | `paragraph.uniqueLocalId` | 1.6 | text search (v1 behaviour) |
| Tables | `body.tables` → `values`, `rowCount`, `headerRowCount` | 1.3 | treat cells as paragraphs, flag degraded |
| Comments | `body.getComments()`, `comment.replies` | 1.4 | disable comment-dependent checks, tell the user |
| Tracked changes | `body.getTrackedChanges()` | 1.6 | diff `getReviewedText(Original)` vs `(Current)` |
| Footnotes | `body.footnotes` | 1.5 | omit, flag degraded |
| Headers / footers | `section.getHeader/getFooter("Primary")` | 1.1 | omit, flag degraded |
| Content controls | `body.contentControls` | 1.1 | omit |

**Capability negotiation is mandatory.** The pane must report which requirement sets are available;
the server records it on `document_version.ingest_schema_version`; and any check whose inputs are
unavailable must be **suppressed and reported as suppressed**, never silently skipped. A pre-signing
QC that quietly didn't check comments is worse than one that says it couldn't.

### 3.3 Structure detection

v1 detects clauses by regex alone (`RE_DECIMAL`, `RE_HEADING`). That breaks on documents using
Word's native multilevel numbering, where the number is not in `paragraph.text` at all.

v2 detection is a three-signal hybrid, each clause carrying a confidence and `detected_by`:

1. **Style** — `styleBuiltIn` in `Heading1..9`, or a named house style.
2. **List level** — `listItem.level` and `listString` give true hierarchy.
3. **Regex** — v1 patterns, as the fallback and as corroboration.

Where signals disagree, prefer style > list > regex, record the conflict, and expose it in
`get_outline` so the supervisor knows the map may be imperfect.

### 3.4 Anchoring for insertion

`findRange()` in v1 locates edits by searching for `old_text`. This is fragile: duplicate strings,
smart-quote normalisation, and formatting runs that split text nodes all break it.

v2 anchoring order: `uniqueLocalId` on the block → offset within block (`char_start`) → search on
`old_text` scoped to that block → search document-wide (v1 behaviour, last resort). Record which
method succeeded in `issue.anchor_method`. Any insertion that falls through to document-wide search
must warn the user before applying.

---

## 4. Deterministic engine

The highest-trust, lowest-cost component. v1 has six check families; v2 targets the set below. Every
check is registered with an id, family, default severity, a precision target, and at least one
golden-set fixture.

### 4.1 Registry contract

```python
@dataclass(frozen=True)
class Check:
    id: str                     # "structure.orphan_schedule"
    family: str
    version: int                # bump on any behaviour change; recorded on findings
    default_severity: str       # high | medium | low
    precision_target: float     # minimum acceptable precision on the corpus
    requires: tuple[str, ...]   # ingestion capabilities, e.g. ("comments",)
    scope: str                  # document | matter
    run: Callable[[Context], list[Finding]]
```

Findings carry `check_id`, `check_version`, `severity`, `block_idx`, `ref`, `detail`, `excerpt`,
and `certainty` (`exact` | `heuristic`). Heuristic checks must never be presented with the same
visual weight as exact ones.

### 4.2 Check set

**Structure**

| id | Description | Certainty | v1 |
|---|---|---|---|
| `structure.broken_xref` | Reference to a clause/schedule that does not exist | exact | ✅ |
| `structure.orphan_schedule` | Schedule exists but is never referenced | exact | ❌ — v1 only checks references→targets, never the reverse |
| `structure.empty_schedule` | Schedule/annexure heading with negligible content beneath | exact | ❌ |
| `structure.numbering_gap` | Missing sibling number | exact | ✅ |
| `structure.duplicate_number` | Same clause number twice | exact | ✅ |
| `structure.missing_chapeau` | Parent clause with children but no lead-in | exact | ❌ |
| `structure.xref_implausible` | Target exists but its heading is unrelated to the citing context | heuristic | ❌ |
| `structure.depth_anomaly` | Inconsistent nesting depth within a sibling set | heuristic | ❌ |

**Defined terms**

| id | Description | Certainty | v1 |
|---|---|---|---|
| `defterm.duplicate` | Term defined more than once | exact | ✅ |
| `defterm.unused` | Defined, never used operatively | exact | ✅ |
| `defterm.undefined_candidate` | Title-case phrase used like a defined term, no definition | heuristic | ✅ (needs precision tuning; currently truncates at 25) |
| `defterm.case_drift` | Defined term appearing in lower case | exact | ✅ |
| `defterm.forward_use` | Used operatively before it is defined | exact | ❌ |
| `defterm.circular` | A defined by reference to B defined by reference to A | exact | ❌ |
| `defterm.scope_mismatch` | Defined in a schedule, used in the body where the definitions clause doesn't reach | heuristic | ❌ |

**Amounts, dates, thresholds**

| id | Description | Certainty | v1 |
|---|---|---|---|
| `amount.figure_word_mismatch` | Figures vs words disagree (incl. lakh/crore) | exact | ✅ |
| `amount.currency_inconsistency` | Multiple currencies with no conversion mechanic | heuristic | ❌ |
| `amount.percentage_sum` | Allocation/shareholding table not summing to 100 | exact | ❌ |
| `date.logic_conflict` | Closing before execution; long-stop before closing; cure period exceeding term; survival shorter than limitation | exact | ❌ |
| `threshold.conflict` | De minimis exceeding basket; cap below basket; a blanket prohibition swallowing a stated threshold | heuristic | ❌ — v1's own eval caught the 6.4-vs-6.1 case by model reasoning; it should be free |

**Parties and execution**

| id | Description | Certainty | v1 |
|---|---|---|---|
| `party.name_drift` | Defined party appearing in variant forms | exact | ❌ |
| `party.capacity_inconsistency` | Same party described in different capacities | heuristic | ❌ |
| `exec.signature_block_mismatch` | Signature blocks vs the parties clause | exact | ❌ |
| `exec.unfilled_placeholder` | `[●]`, `[insert]`, TBD, XXX | exact | ✅ |
| `exec.unresolved_comment` | Word comments still open | exact | ❌ (needs §3 ingestion) |
| `exec.pending_tracked_change` | Unaccepted revisions at pre-signing | exact | ❌ (needs §3 ingestion) |

**Cross-document (matter scope, new in v2)**

| id | Description | Certainty |
|---|---|---|
| `xdoc.defterm_conflict` | Same term defined differently across documents in the matter | exact |
| `xdoc.threshold_conflict` | Thresholds disagreeing between, e.g., SSA covenants and SHA reserved matters | heuristic |
| `xdoc.orphan_reference` | Document A refers to a schedule/clause of document B that doesn't exist | exact |
| `xdoc.disclosure_mapping_gap` | Disclosure letter paragraphs not mapping to warranty numbers, or warranties with no disclosure | exact |

### 4.3 Pagination and truncation

v1 silently truncates in four places: `outline()` caps at 400 items, `search()` at 40 hits,
`get_definition` returns only the first 60 usage sites, and every tool result is cut at 60,000
characters mid-JSON. The model is never told about any of them. v2: every truncating tool returns
`{"truncated": true, "total": N, "shown": M, "next_cursor": ...}` and the model is instructed that a
truncated result is not a complete answer. A supervisor that believes it has seen every occurrence of
"indemnity" when it has seen forty is a correctness bug, not a performance one.

---

## 5. Tool surface

### 5.1 Full tool list

Existing tools keep their names. `doc_id` is optional everywhere and defaults to the matter's
primary document.

| Tool | Status | Notes |
|---|---|---|
| `get_outline` | changed | adds `confidence`, `detected_by`, pagination |
| `read` | changed | adds `doc_id`; returns block kind and table coordinates |
| `search_document` | changed | adds `doc_id`, pagination, `total` |
| `search_matter` | **new** | search across every document in the matter |
| `get_definition` | changed | adds scope, cross-document conflicts |
| `list_definitions` | unchanged | |
| `run_mechanical_checks` | changed | filterable by family; reports suppressed checks |
| `read_table` | **new** | structured rows/columns, header row identified |
| `get_comments` | **new** | unresolved-only filter, thread structure |
| `get_tracked_changes` | **new** | by author, by type, with before/after text |
| `compare_versions` | **new** | semantic change list between two versions — enables Mode L, which **cannot work in v1** because `ReviewRequest` accepts a single `paragraphs` list |
| `list_documents` | **new** | the matter's documents and their roles |
| `check_overlap` | **new** | where else in the matter this risk is already addressed |
| `get_precedent` | **new** | the firm's own prior language on a topic, with provenance |
| `get_house_position` | **new** | learned positions relevant to a topic |
| `plan` / `revise_plan` | **new** | explicit, user-visible plan |
| `delegate` | changed | adds `doc_id`; parallel batch variant |
| `record_issue` | changed | see §5.2 — now enforcing |
| `ask_user` | changed | answers persist on the matter and are available in later runs |
| `finish` | unchanged | |

### 5.2 `record_issue` becomes an enforcement point

This is the highest-leverage change in the spec. v1 *warns* on a bad anchor and records the issue
anyway. v2 **rejects** and makes the model fix it. Skill rules become invariants:

```
REJECT if old_text is present and does not appear verbatim in the document
        → "old_text not found. Re-read the paragraph and copy the wording exactly."
REJECT if old_text exceeds 200 characters
        → "Too long for Word to locate. Narrow the change."
REJECT if position ∈ {revise, delete} and old_text is empty
        → "A revise/delete position requires the exact words being changed."
REJECT if the issue proposes new protection and overlap_trace is empty
        → "Call check_overlap first. Adding a second remedy for one wrong is a failure."
REJECT if severity == 'high' and consequence is thin (< 120 chars, or no economic/legal effect)
        → "State what actually goes wrong, not a paraphrase of the clause."
REJECT if block_idx is outside the document, or the ref does not resolve
DOWNGRADE to tier 3 if no anchor is possible (advisory issues are legitimate — just labelled)
```

Rejections return a structured error the model must act on, and are counted in
`run.budget_json` so a model that fights the policy shows up in evaluation.

### 5.3 Evidence tiers

Every issue carries exactly one:

| Tier | Name | Meaning | UI treatment |
|---|---|---|---|
| 1 | **Proven** | Produced by the deterministic engine, `certainty: exact`. Reproducible, no model involved. | Solid badge, no hedging |
| 2 | **Anchored** | Model judgement, quoted text verified verbatim, block anchor confirmed | Standard card with Insert enabled |
| 3 | **Advisory** | Judgement with no text anchor — missing provisions, commercial calls, factual confirmations | Visually distinct; no Insert button; labelled "judgement" |

`provenance_json` records, for every tier 2 and 3 issue: the tool calls that produced it, the model
and provider that produced it, and the overlap trace. This is what makes "show me why" a one-click
answer, and it is the single feature most likely to win a sceptical partner in a demo.

---

## 6. Orchestration

### 6.1 Loop changes

| Concern | v1 | v2 |
|---|---|---|
| Planning | implicit | `plan()` called first; plan shown in the pane; `revise_plan()` on change of direction |
| Budget | `max_supervisor_steps: 40`, nothing else | step + token + **cost** ceilings; at 80% consumed, switch to "record what you have and finish"; hard stop with a partial result rather than a truncated one |
| Prompt | full 4,500-word skill + all 14 mode briefs, every call | sectioned: locked core (§3, §5, §7, §10, §13, §14) + active mode file + relevant house positions + mandate |
| Caching | none | provider cache directives on the static system prefix — the single largest cost lever available |
| Delegation | sequential, budget 25 | parallel batch fan-out for schedules and warranty sets |
| Malformed args | swallowed (`args = {}` on JSON error) | re-prompt with the schema error; count as a failed step |
| Usage | `usage` block discarded | captured per call, per role, per run |
| Determinism | `temperature: 0.2` global | per-role temperature; supervisor lower; seed where the provider supports it |

### 6.2 The reviewer pass — a fifth role

After `finish`, before results are shown, a separate `reviewer` model receives the recorded issue
set (not the full transcript) and the §14 QC checklist, and returns a verdict per issue:
`confirm` | `downgrade` | `merge` | `drop`, with a reason. Anchors are re-verified deterministically
at the same time.

This is the second reader a partner would use, and it attacks the precision problem — the thing that
makes lawyers stop trusting these tools — directly and measurably. `reviewer_verdict` and
`reviewer_note` are stored on the issue so the effect is visible in evaluation: run the corpus with
the reviewer on and off, and the delta in `noise_rate` is the value of the pass.

### 6.3 Resumable runs

Runs become async. `POST /api/matters/{id}/runs` returns a `run_id` immediately; events stream from
`GET /api/runs/{id}/events` with `Last-Event-ID` replay out of `run_event`. The lawyer can close the
pane, close Word, and come back. This also unlocks batch review of a data room, which no Word add-in
competitor offers.

---

## 7. Memory and learning

Three layers, built on `disposition`.

### 7.1 House positions

- Every issue gets a disposition when the user accepts, edits, rejects or defers it. Editing the
  proposed wording captures `(proposed, final)` — the most informative signal available.
- A topic classifier (extractor role, cheap) maps the issue to a topic taxonomy
  (`liability.cap`, `indemnity.trigger`, `transfer.tag_along`, …).
- **Promotion rule:** N consistent dispositions on a topic within a scope → an active `position`
  with a confidence. Contradictory evidence lowers confidence rather than flipping the position.
- **Suppression:** repeated rejection of the same class of finding creates a `never_propose`
  position. This is how the flag flood dies.
- Positions are injected into the prompt as a bounded, relevance-ranked block — never the whole
  table.
- **Positions must be visible and editable.** A "Positions" screen listing every learned position,
  its evidence count, and the issues that produced it, with edit and delete. A learning system a
  lawyer cannot inspect is one they will not trust, and inspectability is itself a differentiator.

### 7.2 Precedent bank

- Ingest executed agreements → segment → topic-classify → embed **locally** (a small sentence
  embedding model on-device; no third-party call, which preserves the confidentiality story).
- `get_precedent(topic, deal_type, party_side)` returns prior language with provenance: which deal,
  when, executed or not, and whether the position survived negotiation.
- Effect on output quality: §12 of the skill warns against pretending a preferred position is
  market. The precedent bank is the honest answer — "your last four SSAs capped at 1× the
  subscription amount; one closed at 1.5×" is a defensible statement, and no general-purpose model
  can make it.

### 7.3 Matter memory

Prior runs on the matter, what was conceded in earlier rounds, and answers to prior `ask_user`
questions carried forward. Round two should never re-ask what round one settled.

---

## 8. Evaluation

Not a nice-to-have. Model resolution in v1 is **dynamic** — `Router.resolve()` sorts by `created`
and takes the newest release in a family — so product behaviour changes silently whenever a provider
ships. Without a benchmark you cannot detect a regression, and you cannot answer whether the
strongest supervisor model is worth its price, which is your entire gross margin.

### 8.1 Corpus

```
eval/corpus/<doc_id>/
  document.docx
  ingested.json      frozen ingestion output — lets engine changes be scored without Word
  labels.yaml        ground truth
  mandate.yaml       party represented, stage, context
```

`labels.yaml` entries:

```yaml
- id: SSA07-cap-01
  type: defect              # defect | negotiation_point | trap
  must_find: true
  ref: "5.2"
  block_idx: 23
  expected_severity: high
  expected_classification: commercial_risk
  description: Liability cap covers the Company only; Promoters uncapped under 4.1
  accept_if_titles_match: ["cap", "promoter", "uncapped"]

- id: SSA07-trap-01
  type: trap
  must_not_flag: true
  block_idx: 31
  description: Deliberately asymmetric but commercially intended indemnity —
               flagging this as a defect is a false positive
```

Target: 20–30 documents. Weighted toward Indian venture and PE paper — SSAs, SHAs, share purchase
agreements, disclosure letters, MSAs, SaaS agreements — plus a few US/UK documents to prove
generality. Include at least three deliberately clean documents; a reviewer that finds problems in a
clean document is the failure mode that destroys trust.

**Traps matter as much as defects.** Precision is what competitors fail on, and it is only
measurable if the corpus contains things that look wrong and aren't.

### 8.2 Metrics

| Metric | Definition | Gate |
|---|---|---|
| `recall@must_find_high` | High-severity must-find labels surfaced | ≥ 0.90 |
| `recall@must_find_all` | All must-find labels surfaced | ≥ 0.80 |
| `precision` | Recorded issues matching a label or adjudicated valid | ≥ 0.75 |
| `trap_rate` | Traps incorrectly flagged | ≤ 0.10 |
| `noise_rate` | Issues per 1,000 words | ≤ ceiling per mode |
| `anchor_pass_rate` | Text edits verified verbatim | **1.00** |
| `overlap_compliance` | Protection proposals carrying an overlap trace | **1.00** |
| `severity_calibration` | Confusion matrix vs expected severity | no cell > 0.15 off-diagonal at distance ≥ 2 |
| `cost_per_run` / `tokens_per_run` | | within budget |
| `latency_p50` / `latency_p95` | | within target |
| `stability` | Jaccard similarity of the issue set across 3 runs, same input | ≥ 0.75 |

Two gates are absolute (`anchor_pass_rate`, `overlap_compliance`) because they are enforced in code
per §5.2 — anything below 1.00 is a bug in the enforcement, not a model shortfall.

### 8.3 Harness

```
python -m agent.eval run   --corpus eval/corpus --mode A \
                           --roles supervisor=<slug>,reviewer=<slug> \
                           --repeat 3 --out reports/
python -m agent.eval diff  --baseline reports/<a>.json --candidate reports/<b>.json
python -m agent.eval checks --corpus eval/corpus     # deterministic only, no model, fast
```

`eval checks` runs on every commit — it needs no network and no model, so there is no excuse for it
not to be in CI. `eval run` gates every model change and every skill change. A model is never
promoted to a customer default until it clears the bar, and customers are always pinned.

---

## 9. Security, tenancy, commercial

### 9.1 Secrets and providers

- No secrets on disk. `keyring` → Windows Credential Manager / macOS Keychain. Migrate and delete
  `config.yaml` keys on first v2 run.
- `providers.yaml` is an explicit allowlist: model slug, provider, region, zero-data-retention flag,
  approved-for-client-documents flag.
- **`Router.resolve()` must fail closed.** v1 falls through to `pool[0]` — the first model in
  whatever order the catalogue returned — when no preference prefix matches. The default prefix list
  is broad enough that this rarely fires, but it fires immediately under `require_only_free: true`
  or any narrowed `prefer` list, silently routing a confidential agreement to an arbitrary model.
  v2 raises instead.
- Every run records provider provenance: model, provider, region, ZDR status, timestamp. Surfaced in
  the pane and exportable.
- Optional pre-flight redaction (party names, amounts) for the most conservative customers, with an
  explicit warning that it degrades quality.

### 9.2 Local API auth

v1 binds `127.0.0.1` with no authentication — any local process can POST a document to
`:8787`. v2: a pairing token generated at service start, exchanged with the pane on first load,
required on every request; CORS restricted to the pane's origin; requests without a valid token
rejected.

### 9.3 Audit

Append-only `audit_log`, per-matter export. Records: runs started, models used, documents ingested,
issues accepted/rejected, positions changed, settings changed, exports taken. This is a procurement
requirement, and it costs almost nothing because the event stream already exists.

### 9.4 Licensing

Signed licence token, seat binding, offline grace period, entitlement checks on run start.
Metering is only possible once §6.1 cost capture exists — build in that order.

### 9.5 Distribution

- Add-in pane hosted on a public HTTPS origin (AppSource requires this; it is also why `local` mode
  needs the pairing handshake in §9.2).
- Microsoft Marketplace listing via Partner Center, plus centralized deployment through the M365
  admin center so a firm's IT can push to all seats.
- Requirement-set declarations in the manifest so Word degrades gracefully rather than erroring.
- SOC 2 Type II: assume it will be asked for by the first serious firm. Start evidence collection
  early — the controls are cheaper to build in than to retrofit.

---

## 10. API contract

```
GET    /api/health                         capabilities, deployment mode, requirement sets
GET    /api/models                         allowlisted models, resolved roles
POST   /api/settings

GET    /api/matters
POST   /api/matters
GET    /api/matters/{id}
POST   /api/matters/{id}/documents         ingest (full-fidelity payload)
GET    /api/matters/{id}/documents

POST   /api/checks                         deterministic only — no model, no cost, offline
POST   /api/matters/{id}/runs              → { run_id }
GET    /api/runs/{id}                      status, budget, provenance
GET    /api/runs/{id}/events               SSE, resumable via Last-Event-ID
POST   /api/runs/{id}/cancel

GET    /api/runs/{id}/issues
POST   /api/issues/{id}/disposition        accepted | accepted_modified | rejected | deferred

GET    /api/positions
PATCH  /api/positions/{id}
DELETE /api/positions/{id}

POST   /api/precedent/ingest
GET    /api/precedent/search

POST   /api/exports/memo                   issues memo → .docx
POST   /api/exports/email                  Mode M output → draft
GET    /api/audit/export
```

`POST /api/checks` staying model-free, offline and instant is a deliberate product decision: it is
the fastest useful thing in the tool and it works with no key, no network and no cost. Lead demos
with it.

---

## 11. Output and deliverables

v1 findings live only in the pane. A lawyer's deliverable is frequently a document.

- **Issues memo** → `.docx`, grouped by severity, with clause references, consequences, proposed
  wording, and evidence tiers. Firm-brandable.
- **Mode M email** → a real draft, not prose returned inside `finish()`.
- **Markup summary** → what was inserted, what was rejected, for the file.
- **Run report** → the audit artifact: tools called, models used, costs, provenance.
- **Matter dashboard** → open issues across all documents, unanswered `ask_user` questions,
  pre-signing readiness.

---

## 12. Non-functional requirements

| Concern | Target |
|---|---|
| Document size | 500 pages / ~15,000 blocks without degradation |
| Truncation | No silent truncation anywhere; `outline()` and `search()` paginate with `total` |
| Offline | Deterministic engine fully functional with no network |
| Cost | Per-run ceiling enforced, default configurable, graceful partial result on exhaustion |
| Latency | Mode A on a 60-page SSA within target p95; plan visible within seconds of start |
| Recovery | A run survives pane close, Word close and service restart |
| Concurrency | `tenant` mode: per-request context, no shared mutable config (v1 mutates a module-level global) |
| Data retention | Configurable; purge-on-close option for the most conservative customers |

---

## 13. Phases

Ordered by dependency. Each phase has an exit criterion that is checkable, not a matter of opinion.

### Phase 0 — Safety and instrumentation

Nothing is measurable or sellable until this is true.

- Secrets to OS credential store; `config.yaml` keys migrated and removed.
- `Router.resolve()` fails closed; explicit provider allowlist; provenance recorded per run.
- Pairing token on the local API.
- Capture `usage`, per-step latency and cost. Persist every run and event to SQLite.
- Provider prompt-cache directives on the static system prefix.

**Exit:** every run is logged with model, provider, tokens, cost and elapsed; no secret on disk; no
path exists by which an unlisted model can see a document.

### Phase 1 — Provable quality

The phase that turns opinions into numbers. Start the corpus first; it is the long pole.

- Golden corpus at ≥ 20 documents with labels and traps.
- Metrics and harness; `eval checks` in CI.
- Split `document.py` into the versioned check registry; implement the remaining document-scope
  checks in §4.2.
- `record_issue` enforcement (§5.2) and evidence tiers (§5.3).
- Reviewer pass (§6.2).
- Pagination and truncation reporting (§4.3).
- Persistence of dispositions (schema from §2, capture in the pane).

**Exit:** a single command produces a scored report; `anchor_pass_rate` and `overlap_compliance` are
1.00; the reviewer pass shows a measured reduction in `noise_rate` on the corpus.

### Phase 2 — Full document fidelity

- Ingestion per §3: comments, tracked changes, tables, headers/footers, footnotes.
- Capability negotiation with explicit suppressed-check reporting.
- Hybrid structure detection with confidence.
- Anchored insertion via `uniqueLocalId`.
- New tools: `get_comments`, `get_tracked_changes`, `read_table`.
- Modes F and N rewritten against inputs that now exist.

**Exit:** Mode F reports on actual counterparty revisions; Mode N reports unresolved comments and
pending tracked changes; table-heavy schedules score on the corpus as well as body clauses.

### Phase 3 — Matter-level intelligence

- Matter and document-version model; multi-document ingestion.
- `list_documents`, `search_matter`, `compare_versions`, `check_overlap` across the matter.
- Cross-document check family (§4.2).
- Mode L becomes functional; new cross-document consistency and disclosure-mapping modes.
- Resumable/async runs (§6.3).

**Exit:** a full SSA + SHA + disclosure letter set reviewed in one run, with at least one
cross-document defect the corpus confirms cannot be found from any single document.

### Phase 4 — Memory that compounds

- Topic taxonomy and classifier.
- Position promotion, suppression, and the Positions management screen.
- Precedent bank with local embeddings and provenance-carrying retrieval.
- Matter memory across rounds.
- Sectioned skill loading; playbook layer split from locked core.

**Exit:** on a replayed corpus run, learned positions measurably reduce repeat proposals the user
previously rejected, without a fall in `recall@must_find`.

### Phase 5 — Commercial readiness

- `tenant` deployment mode; BYO Azure OpenAI / Bedrock endpoints; SSO.
- Accounts, licensing, entitlement, metering.
- Exports and matter dashboard (§11).
- AppSource listing and M365 centralized deployment.
- Audit export, data-handling documentation, SOC 2 evidence collection.

**Exit:** a firm can install it from the M365 admin center, run it against their own model endpoint,
and export an audit log — without you touching their machine.

---

## 14. Sequencing notes

Three ordering traps worth naming, because each is tempting and each costs a rebuild:

1. **Phase 3 demos better than Phase 1, and will tempt you to reorder.** Don't. Cross-document
   review built on an unmeasured engine produces cross-document noise, and you'll have no way to
   tell. The corpus is also the thing that takes longest to build — start it first precisely because
   it isn't glamorous.
2. **The `disposition` schema is load-bearing for four separate features** — audit, learning,
   precedent quality and metering. It looks like a Phase 4 concern. It is a Phase 1 concern. Design
   it once, properly, and capture data from the first run, even before anything consumes it.
3. **Ingestion fidelity is upstream of every quality claim.** Any recall number measured before
   Phase 2 is measured on a document the tool can only partly see. Freeze `ingested.json` in the
   corpus so Phase 2 improvements can be scored as a clean before/after rather than silently
   moving the baseline.
