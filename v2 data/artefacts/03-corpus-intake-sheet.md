# 03 — Corpus intake sheet

Intake plan for acquiring and labelling 20 additional eval
documents. This is not the corpus. Do not create directories or
YAML under `eval/corpus/` from this sheet. Do not synthesize
agreement text here.

Plan basis: section 13.1 (P0 test layers, plan 1134–1210),
section 13.5 (evaluation expansion, plan 1280–1299), section 15
P0 (plan 1387–1404).

Current loader (`agent/eval/corpus.py` 20–41): a corpus entry is
a directory whose name is the `doc_id`, containing
`ingested.json` and `labels.yaml`. Directories starting with `_`
are skipped. Existing slugs: `sample_sha`, `synth_dates`,
`synth_fidelity`, `synth_v2`, `synth_xdoc`. Template README
also shows deal-style ids (`ssa-aurora-2026`). New slugs follow
the existing `sample_*` / `synth_*` / `mut_*` pattern.

`labels.yaml` `check:` values must use the registry **legacy**
string. `agent/eval/metrics.py` `match_label` (lines 49–63)
compares `issue.check` to `label.check` by exact string, and
the engine still emits legacy names
(`agent/check_registry.py` `Check.legacy`). Registry ids are
listed next to the legacy string so later commits can stamp
`check_id` without relabelling.

## Existing coverage (do not duplicate)

Counted from the five live `labels.yaml` files. This is the
current 29/29 `agent.eval checks` gate
(`.github/workflows/eval-checks.yml` line 19;
`agent/eval/checks.py` 58–60).

| Existing slug | What it is | Must-finds (legacy / registry id) | Traps | Ground already covered |
|---|---|---|---|---|
| `sample_sha` | Short Indian-style SHA/SSA hybrid (`ingested.json` title "SHARE SUBSCRIPTION AND SHAREHOLDERS AGREEMENT") | 6: `amount_mismatch` / `amount.figure_word_mismatch`; `broken_cross_reference` / `structure.broken_xref`; `unfilled_placeholder` / `exec.unfilled_placeholder`; `numbering_gap` / `structure.numbering_gap`; `defined_but_unused` / `defterm.unused`; `threshold_conflict` / `threshold.conflict` | 0 | Figure/words clash, dead clause ref, `[●]`, missing 3.2, unused defined term, blanket-vs-threshold |
| `synth_dates` | Synthetic SHA focused on dates and money | 8: four `date_logic_conflict` / `date.logic_conflict` (refs 1.1, 1.2, 3.2, 7.1); `currency_inconsistency` / `amount.currency_inconsistency`; two `threshold.conflict`; `signature_block_mismatch` / `exec.signature_block_mismatch` | 0 | Closing before execution, long-stop before closing, cure > term, survival < limitation, INR/USD with no conversion, blanket spend, de minimis > basket, missing Investor signature block |
| `synth_fidelity` | Synthetic SHA plus ingested comments/revisions | 4: `xref_implausible` / `structure.xref_implausible`; `depth_anomaly` / `structure.depth_anomaly`; `unresolved_comment` / `exec.unresolved_comment`; `pending_tracked_change` / `exec.pending_tracked_change` | 1 (`FID-trap-01`: notice-to-Schedule-2 is not implausible) | Host-fidelity checks that `requires` `comments` / `revisions` (`check_registry.py` 79–82). `synth_fidelity/ingested.json` is the only current entry that populates those arrays |
| `synth_v2` | Synthetic SHA for structure/defterm/party/percent | 7: `orphan_schedule`, `empty_schedule`, `missing_chapeau`, `forward_defined_term`, `circular_definition`, `party_name_drift`, `percentage_sum` | 2 (`SYNTH-trap-01` cited Schedule 1; `SYNTH-trap-02` clause 3 with operative 3.1) | Schedule 4 orphan+empty, heading-only clause 9, Escrow used before 10.1, Alpha/Beta circular, Helios Ltd vs Private Limited, 40/35/15 |
| `synth_xdoc` | Synthetic SSA + SHA + disclosure-letter companions | 4: `xdoc_defterm_conflict` / `xdoc.defterm_conflict`; `xdoc_threshold_conflict` / `xdoc.threshold_conflict`; `xdoc_orphan_reference` / `xdoc.orphan_reference`; `xdoc_disclosure_mapping_gap` / `xdoc.disclosure_mapping_gap` | 0 | Matter-scope checks that `requires` `companions` (`check_registry.py` 83–90). Only current entry with a `companions` array |

Registry ids with **no** current corpus must-find:

- `structure.duplicate_number` (`duplicate_numbering`)
- `defterm.duplicate` (`duplicate_definition`)
- `defterm.undefined_candidate` (`possibly_undefined_term`)
- `defterm.case_drift` (`defined_term_case_drift`)
- `defterm.scope_mismatch` (`scope_mismatch`) — exercised only
  in `tests/test_pipeline.py` 297–303
- `party.capacity_inconsistency` (`capacity_inconsistency`) —
  exercised only in `tests/test_pipeline.py` 284–295

No current entry is a clean document. No current entry is an
MSA/SaaS, NDA, SPA, standalone disclosure letter, UK/US
governing-law paper, or a subsequent-round mutation. None carry
selection / transcript / reference-resolution labels (plan
1289; those labels belong on the same deal folder once artefact
5 exists).

## Labelling schema (actual keys)

Quote the keys already used. Do not invent a parallel schema.

### `labels.yaml` item keys

From `eval/corpus/_template/labels.yaml` and the five live
files. Matcher also accepts `block_idx` / `para` as locus and
`accept_if_titles_match` as an alias of `accept_if`
(`metrics.py` 9–16, 40–46).

| Key | Required | Used today | Notes |
|---|---|---|---|
| `id` | yes | all five | Stable, unique per deal. Pattern `DEAL-01`, `SAMPLE-amount-01`, `SYNTH-orphan-01` |
| `type` | yes | all five | `defect` \| `negotiation_point` \| `trap` (template lines 4–7) |
| `must_find` | yes | all five | `true` for defects that `checks` scores as must-finds |
| `must_not_flag` | yes | all five | `true` for traps. `metrics.py` 36–37 also treats `type: trap` as a trap |
| `check` | if mechanical | all current must-finds | **Legacy** id from `check_registry.py`. Empty string for judgement calls (template lines 9–16) |
| `ref` | if known | most | Clause / schedule number (`"5.2"`, `"Schedule 3"`) |
| `quote` | if no reliable ref | template only | 6–12 words copied from the document (template line 19) |
| `description` | yes | all five | What a lawyer would write |
| `accept_if` | recommended for model issues | `sample_sha` | Word list that makes a model title count as a hit |
| `expected_severity` | new real deals | template only | `high` \| `medium` \| `low` |
| `expected_classification` | new real deals | template only | `legal_defect` \| `drafting_defect` \| `commercial_risk` \| `negotiation_preference` \| `factual_point` |
| `why_it_matters` | new real deals | template only | Harm for the represented party |
| `why_it_is_intended` | traps | template only | Why flagging it is a precision miss |

Template rule (lines 1–2, 25–26, 97–98): 5–15 must-finds and
3–5 traps per deal. Quality beats volume. Leave `check` empty
for judgement (cap, indemnity, reserved matters).

### `mandate.yaml` keys

From `eval/corpus/_template/mandate.yaml`. Existing five
entries have no `mandate.yaml`; every new entry must add one.

`id`, `name`, `client`, `party_represented`, `counterparty`,
`document_type`, `deal_type`, `governing_law`, `seat`, `stage`,
`round`, `primary_document`, `other_documents` (list of
`{file, role}` where role is `primary` \| `counterpart` \|
`disclosure_letter` \| `side_letter` \| `precedent` \|
`ancillary`), `confidential`, `redacted`, `notes`,
`review_goal`.

`document_type` values already listed in the template:
`SSA` \| `SHA` \| `SPA` \| `SHA+SSA` \| `disclosure letter` \|
`MSA` \| `SaaS` \| `other`.

## Twenty planned entries

`Source` = `redacted-real` (needs consent + redaction) |
`synthetic` | `mutated-from-existing`. `Refs` = expected
cross-references the labels must name.

| # | Slug | Type | Source | Must-find defects (legacy / registry) | Traps (must not fire) | Expected refs |
|---:|---|---|---|---|---|---|
| 1 | `sample_ssa_in` | SSA | redacted-real | Judgement: indemnity double-recovery, CP long-stop vs closing, reserved-matter gap. Mechanical only if present after redaction — do not plant. Prefer empty `check` for judgement | Commercially intended broad MAE; investor-friendly reserved matter that looks one-sided | Indemnity clause, CP schedule, MAE definition, at least one reserved-matter clause |
| 2 | `sample_sha_in` | SHA | redacted-real | Judgement: transfer-restriction hole, deadlock, reserved-matter vs board quorum. Not a replay of `sample_sha` mechanicals | ROFR that looks circular but is staged; tag that looks missing a drag but is intentional | Transfer clause, reserved matters, quorum, ROFR/tag/drag |
| 3 | `sample_spa_pe_in` | SPA | redacted-real | Judgement: locked-box leakage, warranty basket vs de minimis, specific-indemnity survival. Mechanical `threshold_conflict` / `threshold.conflict` only if a real blanket swallows a numeric threshold **and** that is not already the `synth_dates` 4.1/5.2 pattern | Locked-box that looks like a completion-accounts defect; knowledge qualifier that looks like a hole | Leakage, consideration, warranty limitations, specific indemnity |
| 4 | `sample_dl_in` | disclosure letter | redacted-real | `xdoc_disclosure_mapping_gap` / `xdoc.disclosure_mapping_gap` against its SSA/SPA warranties (extends `synth_xdoc`, a short synthetic SSA+SHA+DL fixture). Judgement: disclosure that does not fairly disclose | A disclosure that fairly qualifies a warranty and must not fire `xdoc_disclosure_mapping_gap` / `xdoc.disclosure_mapping_gap` | Warranty  / DL paragraph pairs, e.g. warranty 4.x ↔ DL 4.x |
| 5 | `sample_msa_saas` | MSA / SaaS | redacted-real | Judgement: unlimited liability limb, data-processing vs security schedule, SLA credit vs sole remedy. No current check covers SLA math — leave `check` empty | Liability cap that looks low but is the commercial deal; auto-renewal that is intended | Liability, indemnity, DPA/security schedule, SLA |
| 6 | `sample_spa_us` | SPA | redacted-real | US/Delaware paper. Judgement: sandbagging, 10b-5 bring-down, materiality scrape. Mechanical only if a real `amount_mismatch` / `amount.figure_word_mismatch` or `broken_cross_reference` / `structure.broken_xref` survives redaction | MAE with pandemic carve-out that looks like a drafting miss; dual-listing of a defined term that is scoped | MAE, bring-down, indemnity basket, definitions |
| 7 | `sample_nda_uk` | NDA | redacted-real | England & Wales mutual NDA. Judgement: missing residual-knowledge carve-out or over-broad affiliates. Mechanical `party_name_drift` / `party.name_drift` only if the party block actually drifts | Residual-knowledge clause that looks like a confidentiality hole; 2-year term that looks short | Confidential information definition, term, affiliates, residuals |
| 8 | `sample_side_letter_in` | side letter | redacted-real | `xdoc_defterm_conflict` / `xdoc.defterm_conflict` or `xdoc_threshold_conflict` / `xdoc.threshold_conflict` against the SHA it amends. Judgement: side letter that silently overrides a reserved matter | Side letter that restates (does not conflict with) a SHA definition | Side-letter clause + SHA clause it touches |
| 9 | `synth_defterm_dup` | SHA | synthetic | `duplicate_definition` / `defterm.duplicate`; `duplicate_numbering` / `structure.duplicate_number`; `defined_term_case_drift` / `defterm.case_drift` | A second appearance of a term that is a cross-reference, not a second definition; two "1.1" headings in a schedule vs body that the engine must not collapse | Both definition loci; both numbered clauses; the case-drift term |
| 10 | `synth_scope_capacity` | SHA | synthetic | `scope_mismatch` / `defterm.scope_mismatch`; `capacity_inconsistency` / `party.capacity_inconsistency`; `possibly_undefined_term` / `defterm.undefined_candidate` | A schedule-scoped definition used only inside that schedule; a party that holds one capacity; a defined term used only in a heading | Body use of a schedule-only definition; the two capacity recitals; the undefined candidate |
| 11 | `synth_clean_sha` | SHA | synthetic | none (clean) | Any mechanical fire is a precision miss. Label 3–5 traps that look like `sample_sha` / `synth_v2` defects but are well-formed (cited schedule with body; operative chapeau; 100% shareholding; later closing date) | Outline only: definitions, reserved matters, notices, one schedule |
| 12 | `synth_clean_ssa` | SSA | synthetic | none (clean) | Same rule as #11, SSA-shaped. Traps: CP list that looks numbered with a gap but uses (a)(c) because (b) was deliberately omitted and is explained | Subscription, CPs, warranties, one schedule |
| 13 | `synth_clean_msa` | MSA | synthetic | none (clean) | Traps: liability cap that looks missing a super-cap; SLA that looks one-sided and is the deal | Liability, SLA, DPA pointer |
| 14 | `sample_xdoc_set` | SHA+SSA + DL | redacted-real | Real-document xdoc quartet, not the short synthetic SSA+SHA+DL fixture `synth_xdoc`. Same four ids: `xdoc_defterm_conflict` / `xdoc.defterm_conflict`; `xdoc_threshold_conflict` / `xdoc.threshold_conflict`; `xdoc_orphan_reference` / `xdoc.orphan_reference`; `xdoc_disclosure_mapping_gap` / `xdoc.disclosure_mapping_gap` | Fairly-mapped disclosure; MAE that is deliberately broader in the SHA | SSA MAE, SHA MAE, SSA borrowing, SHA borrowing, SSA warranty ↔ DL para, SSA cite of a real SHA schedule |
| 15 | `synth_ctx_indemnity` | SHA | synthetic | Optional mechanical: none required. Purpose is contextual labels (selection / transcript / mentions / candidates / ambiguity) for “check this against the indemnity clause” (plan 1216–1223) | “indemnity” used only as a defined term, not as the operative clause — resolver must not silently pick it | Selection block; at least two indemnity-like headings; the intended target |
| 16 | `mut_sample_sha_r2` | SHA+SSA | mutated-from-existing | Start from `eval/corpus/sample_sha/ingested.json`. Repair the 2.2 citation of missing Clause 2.4 so `SAMPLE-xref-01` (`ref: "2.2"`, `broken_cross_reference` / `structure.broken_xref`) no longer fires. Plant a **new** `broken_cross_reference` / `structure.broken_xref` on a different citing clause. Keep `SAMPLE-amount-01` (`amount_mismatch` / `amount.figure_word_mismatch`) | The now-valid 2.2 reference must not still fire `broken_cross_reference` / `structure.broken_xref` | Repaired 2.2 (trap after mutation); new citing clause for the planted broken xref; unchanged 2.1 amount clash |
| 17 | `synth_trap_reserved` | SHA | synthetic | One real `threshold_conflict` / `threshold.conflict` that is **not** the 6.4-vs-6.1 `sample_sha` wording | 3–5 commercially intended reserved matters that look like conflicts (ordinary-course carve-out vs numeric cap; “whatsoever” limited to a defined Excluded Borrowing) | The real conflict pair; each trap pair with `why_it_is_intended` |
| 18 | `synth_trap_schedules` | SHA | synthetic | One real `orphan_schedule` / `structure.orphan_schedule` on a schedule that is never cited | Cited schedule whose heading looks unused; empty-looking schedule whose body is a defined-term table; “Schedule 3” mentioned in a heading-only contents page | The true orphan; each cited schedule |
| 19 | `synth_exec_pack` | SHA | synthetic | `unfilled_placeholder` / `exec.unfilled_placeholder` on a different token than `sample_sha`’s `[●]`; `signature_block_mismatch` / `exec.signature_block_mismatch` on a three-party document missing the Promoter block (not the two-party `synth_dates` Investor miss); `capacity_inconsistency` / `party.capacity_inconsistency` if not already fired cleanly by #10 | `[Company Name]` inside a specimen signature block that is clearly a template exhibit, not operative | Operative placeholder locus; party list vs signature blocks |
| 20 | `sample_sha_uk` | SHA | redacted-real | England & Wales / Delaware-style venture SHA. Judgement-heavy. Mechanical only if a real uncovered id appears | English-law “best endeavours” that looks like a defect to an Indian-law checker; optional deed formalities | Reserved matters, good-leaver, drag |

## Real vs synthetic (consent)

Need a real document, so a redaction and consent step before
the files land under `eval/corpus/`:

- #1 `sample_ssa_in`
- #2 `sample_sha_in`
- #3 `sample_spa_pe_in`
- #4 `sample_dl_in`
- #5 `sample_msa_saas`
- #6 `sample_spa_us`
- #7 `sample_nda_uk`
- #8 `sample_side_letter_in`
- #14 `sample_xdoc_set`
- #20 `sample_sha_uk`

Consent bar, from `eval/corpus/_template/README.md` 20: do not
take privilege logs, advice emails, or anything that would not
go in a data room. Redact party names only if required, and set
`mandate.yaml` `redacted: true` so labels match the redacted
text. `confidential: true` is the template default.

Safely synthetic (no consent, no live-matter text):

- #9 `synth_defterm_dup`
- #10 `synth_scope_capacity`
- #11 `synth_clean_sha`
- #12 `synth_clean_ssa`
- #13 `synth_clean_msa`
- #15 `synth_ctx_indemnity`
- #17 `synth_trap_reserved`
- #18 `synth_trap_schedules`
- #19 `synth_exec_pack`

Mutated from an existing repo fixture (no new consent):

- #16 `mut_sample_sha_r2` — derived from `sample_sha` only.

Plan 13.5 (1282–1288) requires Indian venture/PE SSAs, SHAs,
SPAs and disclosure letters, MSA/SaaS, a few US/UK documents,
and at least three clean documents. Rows 1–4, 14 cover Indian
deal paper; 5 and 13 cover MSA/SaaS; 6, 7, 20 cover US/UK;
11–13 are the three clean documents.

## All-synthetic corpus risk

An all-synthetic corpus will keep `agent.eval checks` green
while the product is only proving it can find defects it
planted. Precision and recall then stop meaning “would a
lawyer have found this on a real mark-up”. Planted mechanicals
cluster on the regex the runner already has
(`check_registry.py` runners such as `_check_amounts`,
`_check_xrefs`). They do not exercise judgement labels, Indian
deal idiom, or the traps a partner would call a commercial
call. The three clean synthetics (#11–13) are necessary
negative controls; they are not a substitute for redacted real
paper. Rows 1–8, 14 and 20 are the ones that keep the 20-entry
expansion from becoming a second `synth_v2`.
