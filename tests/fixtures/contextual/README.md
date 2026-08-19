# Contextual Command fixtures

Design fixtures for the v2 Contextual Command resolver. They pin selection,
transcript, mentions, the deterministic candidate pool, ambiguity, and the
expected action policy *before* the typed schemas exist.

Nothing in this repository can execute these fixtures today. Plan section 5.3
schemas (`RawInput`, `IntentSpec`, `ReferenceMention`, `ReferenceCandidate`,
`ResolvedReference`, `ContextualCommand`) and the 5.2 action envelope
(`SelectionAnchor`, `ActionPrecondition`, `ProposedAction`) arrive in commit 2.
The deterministic resolver, ambiguity gate and action-risk policy arrive in
commit 18 (`agent/contextual/resolver.py`, `interpreter.py`, `policy.py`).
Until then this directory is the contract those commits are built and graded
against.

Do not invent a resolver, interpreter, or schema module to make these "pass".
`validate.py` checks structure and self-consistency only.

## What commit 18 consumes

Each case is one row of the plan 13.2 fixture table:

- input: `command` (selection captured at activation, raw transcript or typed
  text, interpreted intent, mentions, document/version identity) plus
  `candidates` (the deterministically produced pool — never model-invented);
- output: `expected.references` (resolved / ambiguous / not_found),
  `expected.action_policy`, `expected.write_permitted`,
  `expected.expected_command_status`.

The load-bearing rule (plan section 1 item 3, section 10.2, section 16
"Resolver guesses a reference"): the resolver may choose among
deterministically produced candidate IDs; it may never invent an unresolved
clause reference. Ambiguity is an explicit state with candidate IDs, never a
confident guess. `ambiguous_two_indemnity_clauses` and
`relative_clause_above_table_ambiguous` fail that implementation if it guesses.

## Governing plan sections

Copied into `commands.json` as `plan_sections`:

| Section | What it governs |
|---|---|
| 5.2 | `SelectionAnchor`, `ActionPrecondition`, `ProposedAction` |
| 5.3 | Contextual Command schemas and enums (authoritative field names) |
| 5.4 | Provenance object shape stored on `command.provenance` |
| 10.1 | Safe command pipeline (capture selection first; human approval for writes) |
| 10.2 | Reference resolution order and stop conditions |
| 10.3 | Worked example: check selected language against the indemnity clause for double-recovery |
| 13.2 | The fixture table and adversarial cases |
| 16 | Prompt-injection and resolver-guesses risk rows |
| 18 | This artefact |

## Hash conventions

Two different kinds of hash appear. Do not mix them.

**Real SHA-256 (lowercase hex).** `selection.selected_text_sha256` and
`ActionPrecondition.old_text_sha256` / `expected_selected_text_sha256` are
`hashlib.sha256(text.encode("utf-8")).hexdigest()` of the corresponding
string. `validate.py` recomputes them.

**Synthetic document version hashes.** `expected_doc_hash` and
`command.provenance.captured_doc_hash` / `expected.live_document_hash` are
readable labels, not hex. They differ visibly between the fresh and stale
cases:

- fresh / current: `sha256:doc-v1-aurora-sha-current`
- after an intervening edit: `sha256:doc-v2-aurora-sha-after-edit`

The document itself is one coherent Shareholders' Agreement
(`document_id` `d0c0a111-0000-4000-8000-000000000001`, matter
`7c3e0a91-2b4d-4f68-a1c0-9d8e7f6a5b4c`) reused across cases. Block ids
are stable across the corpus: Clause 6.1
(`b1000006-0001-4000-8000-000000000061`) is the indebtedness reserved-matter
sentence; the repeated phrase "the prior written consent of the Investor"
lives in Clause 7.1 (selected) and Clause 7.3 (other occurrence), not in 6.1.
Clause 5.3 gross-up language is the 10.3 selection.

Empty `selected_text` still carries the real SHA-256 of the empty string
(`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).

## Extensions beyond plan 5.2 / 5.3

The case wrapper (`name`, `why`, `command`, `candidates`, `expected`) is the
fixture file, not a runtime schema.

Fields on `expected` that the plan does not name:

| Field | Why it exists |
|---|---|
| `action_policy` | Plan 13.2 / artefact 18 require an expected action policy. Object with `decision` (`allow_read` \| `allow_write_with_approval` \| `confirm_before_act` \| `refuse`) and `reason`. |
| `write_permitted` | Bool. Plan 13.2: "whether a write is allowed". |
| `expected_command_status` | `ContextualCommand.status` after resolution / the version-hash gate. |
| `live_document_hash` | Synthetic live hash at evaluation time. Differs from `command.provenance.captured_doc_hash` only in `stale_document_version_refused`. |
| `notes` | Hand-check commentary (related-provision navigation for 10.3, stop-condition citations). |
| `proposed_action` | Optional `ProposedAction`. Present only when a write is authorised. |

`command.provenance` is a `dict` in 5.3. The fixtures fill the 5.4
`Provenance` keys and add `captured_doc_hash` (synthetic, see above).

`action_policy.decision` is a fixture-only vocabulary. It is not a 5.3 enum.

`ReferenceCandidate.structural_path` appears only on the two outline
alternatives in `relative_clause_above_table_ambiguous` so the paragraph-above
(14.1) and table header (`row-0`) interpretations are different locations.
Plan 5.3 candidates do not name this field; `SelectionAnchor` does.

## Extra validator checks (beyond plan 13.2)

`validate.py` does not import `agent/` or `server/`. Standard library only.
In addition to key/enum/candidate-ID checks it enforces:

1. **Offset integrity.** For every mention,
   `raw_input.raw_text[start:end] == mention.text` exactly.
2. **Hash integrity.** `selection.selected_text_sha256` is the real lowercase
   hex SHA-256 of `selection.selected_text`. When a `proposed_action` is
   present, `old_text_sha256` is checked against `old_text`, and
   `expected_selected_text_sha256` (if present) is checked against
   `precondition.anchor.selected_text`.

It also requires: unique case names; enum values only from plan 5.2/5.3;
every `ref_id` under `expected` exists in that case's `candidates`; an
ambiguous case has 2+ candidates, 2+ alternatives, no chosen candidate,
`write_permitted` false and no `proposed_action`; a `not_found` mention cites
no candidate ID; a write-authorising case carries a document version hash and
an exact quote.

## How to run

Interpreter is `.venv/Scripts/python.exe`. Bare `python` on this machine is
3.14 and will fail.

```
.venv/Scripts/python.exe tests/fixtures/contextual/validate.py
.venv/Scripts/python.exe tests/fixtures/contextual/validate.py --list
```

`--list` prints `name: why` per case and exits 0. The default mode prints a
`PASS`/`FAIL` line per case and ends with `contextual fixtures: N/N cases valid`.
