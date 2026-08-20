# Golden vertical slice — implementation checklist

Binding inputs: `For developer, with love.txt`, `v2 data/SPEC-V2.md`,
`v2 data/Agmt_Agent_v2_Implementation_Plan.md` (schemas 5.2–5.4, flow 10.3),
and the existing Agmt runtime. Architecture is not being reopened.

Vaquill (`Vaquill-AI/ms-word-addin`, Apache-2.0, commit `fd53dba`) is an
ingredient. Only Office.js mechanics listed in the prompt are adapted into
`addin/src/word/`. Notices live in `THIRD_PARTY_NOTICES.md`.

## Files expected

| Area | Create / modify |
|---|---|
| Flags | `agent/flags.py`, `config.example.yaml`, `/api/health` |
| Schemas | `agent/schemas/` — SelectionEnvelope, ContextualCommand, Evidence, ProposedAction |
| Contextual | `agent/contextual/` — interpret, resolve, focused analysis, draft |
| Runtime | `agent/runtime/` — `LegalExecutionRuntime`, current + DSH spike |
| Actions | `agent/actions/` — tickets, prepare, live revalidation, verify |
| Reviewer | `agent/reviewer.py` — evidence re-read; failure → `unreviewed` |
| Server | `server/app.py` — additive contextual/action routes |
| Word lib | `addin/src/word/*`, `addin/src/contracts/*`, `addin/src/contextual/*`, `addin/v2.js` |
| UI | `addin/taskpane.html/.css/.js` — contextual card behind flags; v1 path kept |
| Tests | `tests/test_golden_slice.py`, `tests/test_contract_freeze.py`, `tests/fixtures/golden/` |

## Sequence (prompt §26)

1. Baseline tests + feature flags (no behaviour change on `/api/review`)
2. Word library scaffolding + typed contracts
3. Reviewed selection/document reads
4. Capability reporting + change events
5. Navigation helpers
6. Tracking-mode serialisation + protected documents
7. DocumentVersion + SelectionEnvelope
8. ContextualCommand schema + API
9. Resolver (`this`, indemnity, ambiguity)
10. Evidence model + exact reads
11. Focused double-recovery path (uses outline/read/definition/search/overlap)
12. Evidence-retrieving independent reviewer
13. Result / evidence / jump UI
14. Minimum-draft + diff UI
15. ProposedAction + approval + action ticket
16. Version-safe Word apply + tracking restore
17. Post-write verification (`confirmed` / `failed_unknown`)
18. End-to-end golden-flow tests
19. DSH runtime adapter behind `AGMT_DSH_RUNTIME`
20. DSH spike on synthetic documents only

## Feature flags

| Flag | Default | Role |
|---|---|---|
| `AGMT_WORD_V2` | `true` | Agmt-owned Word library + contextual pane surface |
| `AGMT_CONTEXTUAL_COMMAND` | `true` | Typed command API |
| `AGMT_SAFE_ACTIONS` | `true` | Ticketed, version-checked apply |
| `AGMT_DSH_RUNTIME` | `false` | Optional DSH transport; never owns legal state or Word |

Env vars override `config.yaml` `flags:`. Existing `/api/review`, mechanical
checks, and `taskpane.js` apply-on-click remain available.

## Do not

Fork Vaquill or DSH. Integrate Docxodus. Hard-code the double-recovery answer.
Silently mutate Word. Auto-confirm a reviewer failure. Expose DSH to the add-in.
