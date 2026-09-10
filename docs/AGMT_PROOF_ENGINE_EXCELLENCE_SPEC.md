# Agmt Proof: engine excellence specification

**Status: Controlling for engine improvement.** This document supplements
[AGMT_PROOF_WORLD_CLASS_PLAN.md](AGMT_PROOF_WORLD_CLASS_PLAN.md) (the controlling
product plan) and governs how the deterministic checking engine is improved.
Where a PWC task already covers work, this spec maps to it and adds only what
is missing. It does **not** modify product requirements, the launch
architecture, or the implementation ledger
([AGMT_PROOF_IMPLEMENTATION_STATUS.md](AGMT_PROOF_IMPLEMENTATION_STATUS.md)).

**Spec branch:** `proof-engine-excellence-spec` (documentation-only).
**Audited commits (2026-09-10):**
`origin/main` = `ca5e934` (merge of `fc44f12` ← `proof-world-class-implementation`);
`origin/proof-world-class-implementation` = `ca5e934`;
`origin/proof-world-class-plan` = `2016c7a` (plan text, on the implementation
branch as cherry-pick `b7126c7`).
**Applicable AGENTS instructions:** `web/AGENTS.md` (hostile-input fail-closed
rules, no-finding-without-validation, narrow-scoped commits). No root AGENTS.md.
**Task IDs:** `PEE-<nn>`. Existing PWC IDs are referenced where work overlaps;
no PWC task is duplicated without saying so.

---

## 1. Executive recommendation

The launch engine is honest and structurally excellent but functionally tiny:
**six rules**, of which two language rules operate on a **four-word typo
allowlist** (`teh, recieve, occured, seperate`) and a ten-word duplicate-word
list. The pipeline around the rules (source map, span validation, evidence
replay, tier-ranked conflict resolution, budgets, honest denominators,
surgical exporter, JS reconstruction validator, Word-verified fixtures) is
already stronger than the rules themselves. **The binding constraint on
usefulness is now rule coverage, not infrastructure.**

Recommended sequence, in strict order:

1. **Scale the existing engine pattern, not a new architecture.** Add
   rules that reuse `launch-checks.ts` candidate → `admitFinding` → evidence
   validation unchanged. No engine rewrite, no server dependency, no LLM.
2. **Structural agreement checks first** (definitions, cross-references,
   party-name consistency, dates/amounts in words-vs-figures). These are where
   a deterministic engine beats human fatigue, every anchor is provable, and
   the false-positive surface is small because the evidence is the document's
   own inventory — not English-language statistics.
3. **Dictionary spelling second** (nspell + `dictionary-en-gb`/`-en-us`),
   comment-only, with run-local exclusion lists. This converts the four-word
   joke into real coverage with near-zero risk profile.
4. **Sentence mechanics third, evaluate-first** — a small closed set of
   high-precision punctuation/spacing/capitalisation rules, hand-written;
   external grammar engines (LanguageTool Java, nlprule WASM) rejected as
   browser dependencies (§7).
5. **Never** promote a rule on pooled accuracy, autocorrect a name/number, or
   fill gaps with model calls. The deterministic ceiling is stated in §10 and
   is a product boundary, not a defect.

The single most important discipline this spec adds: **per-rule promotion
gates with pre-registered denominators** already exist in `metrics.ts` and
`beta-rule-denominators.ts`; every new rule must enter the registry disabled
(`defaultEnabled: false`) and earn promotion through the §8 gates.

---

## 2. Code-evidenced current-state audit

All claims below were read from the audited commits (see header), not inferred.

### 2.1 What is enabled now

`web/src/lib/agmt/proof/registry.ts` — `LAUNCH_RULE_SPECS`, all `phase: "A"`,
all `defaultEnabled: true`, all `evidenceValidator: "span_v2"`:

| Rule | Action | Evidence tier | Reality |
|---|---|---|---|
| `language.typo_allowlist` | correction | exact-mechanical | Matches exactly 4 words (`typo-allowlist.ts`: `teh→the, recieve→receive, occured→occurred, seperate→separate`) |
| `language.duplicate_word` | correction | exact-mechanical | `\b([a-z]+)( +)(\1)\b` gated to 10 function words (`DUPLICATE_FUNCTION_WORDS`) |
| `completion.placeholder` | comment | exact-mechanical | `[(●|TBD|insert date|name|amount|address)]` patterns |
| `references.missing_target` | comment | exact-structural | `Clause/Section N` uses checked against numbering inventory; external/range/coordinated refs excluded |
| `references.duplicate_number` | comment | exact-structural | Duplicate literal/numbering labels within a scope |
| `definitions.duplicate` | comment | exact-structural | Duplicate defined-term declarations |

Guardrails around them (all verified in source):

- `ordinaryProse()` exclusion: skips quotes, non-Latin scripts, URLs/emails,
  headings/addresses/signature styles, definition labels, paragraphs containing
  party-block keywords, paragraphs after `IN WITNESS`, re-use of any quoted
  defined term anywhere, and paragraphs without an auxiliary/modal verb.
- `MAX_CANDIDATES_PER_RULE = 2_000`, `RULE_TIME_BUDGET_MS = 2_000`;
  `MAX_PUBLISHED_FINDINGS = 500`, per-rule 100, union-UTF16 cap 300
  (`resolve-findings.ts`); omitted counts are recorded, never silent.
- Existing tracked changes: correction inside a revision degrades to comment
  (`launch-checks.ts` `language()`); documents with `complex_revision` gap,
  `commentsExtended`/`people.xml`, or document protection are refused
  (`launch.ts` `analyzeProof`).
- Non-main-story text present → `non_main_story_checks` gap → coverage
  `limited`; protected-text nodes → `protected_text_language_checks`.
- `rule-runtime.ts` records per-rule outcome (`completed_with_findings`,
  `completed_zero_findings`, `suppressed`, `failed`, `not_applicable`) with
  reason codes; `all_checks_failed` aborts the run.

### 2.2 Infrastructure that already exists (do not rebuild — PWC-04..15)

- **Exact source map** `source-map.ts`: paragraph `textStart/textEnd` offsets
  validated against `exactQuote` on every finding (`validateSourceSpan`);
  related spans validated too. Main story only (`partUri:
  "/word/document.xml"` hard-coded — known limitation).
- **Story/field/capability inventory** `package-capabilities.ts`,
  `docx-v2.ts`, `numbering.ts` (numbering resolution), `definitions.ts`
  (legacy extractors reused as inputs).
- **Evidence** `evidence.ts`: absence inventories, scope evidence, span_v2
  validation, `EvidenceError("mapping_corruption")` fail-closed.
- **Conflict resolution** `resolve-findings.ts`: dedupe, tier-ranked overlap
  arbitration, cross-story/cell protection, caps with receipts.
- **Exporter** `export/docx.ts`, `ooxml.ts`, `edit-capabilities.ts`,
  `receipt.ts`: surgical tracked-change + classic-comment insertion, edit
  preflight per finding (`admitFinding`), export plan schema
  (`proof-ooxml-v1`, author "Agmt Proof", initials "AP").
- **Validation** `web/src/lib/agmt/validation/` (JS reconstruction validator
  per document) and `infra/proof/validator/` (Open XML SDK, lab oracle).
- **Word evidence**: `docs/proof/word-review/` — 4 synthetic pairs opened in
  real Word COM (body/table/prior_review/party_name PASS; split_runs labelled
  not opened). `web/src/lib/agmt/corpus/launch-demo/` mirrors these. This is
  **Tested/Verified on lab fixtures only**, not a live signed-in
  upload→download receipt (ledger records the same).
- **Corpus**: `corpus/pwc/` — 48 generated packages, family-hash
  development/calibration/held_out splits, per-rule metrics with
  not-evaluated-not-100% semantics, beta-rule honest denominators.
- **Browser runtime**: `web/src/lib/proof-local/` (worker, protocol, limits,
  pipeline) deployed at `app.agmt.legal/proof`; anonymous journey Verified in
  Chromium. Live signed-in Proofread→download outstanding.

### 2.3 Verified current limits (not assumed)

`web/src/lib/proof-local/policy.ts` (`proof-local-limits-v3`): **desktop 100 MiB
source / 120 MiB output / 90 s / 2,000 entries / 150 MiB expanded / 100 MiB
per entry / 20:1 / 2 MiB central directory / 8 MiB document.xml / 12 MiB total
XML / 1e6 extracted Unicode code points.** Mobile: **8 MiB source / 12 MiB
output / 45 s / 24 MiB expanded / 2 MiB document.xml** — conservative phone-UA
class, **not mobile-browser verified.** Missing `navigator.deviceMemory` does
not reject; `deviceMemory` and `pointer: coarse` do not select mobile (touch
laptops stay desktop). Phone UA / UA-CH `mobile` selects the 8 MiB class.
The server-side `ZIP_LIMITS` (25 MiB/100 MiB expanded) are **not** the
browser ceiling. 2026-09-10 measurement: image-heavy 100 MiB Chromium 5.4 s
and Word-opened; representative complete agreements at Word-measured ~293
pages process in Chromium (~1–2.5 s) with planted findings exact. The old
1 MiB document.xml admit gate would have refused the 150-page-target family
(`document.xml` 1.46 MiB, extracted 376k code points). Dense prose still
fails `extracted_text_limit` near 1e6 visible code points. 100 MiB is not
unlimited and is not a claim that every 100 MiB agreement is text-checkable.

### 2.4 Known defects / gaps (carried from ledger, still true at `ca5e934`)

1. Main-story-only source map (PWC-38 target).
2. `scanning→processing` transition still disallowed in
   `product-runs.ts` (must-not-change; server path is disabled anyway).
3. Language checks are ASCII-space-only for duplicate words; tabs skip.
4. No date/amount/party-name/placeholder-format checks at all
   (`party_name.docx` fixture exists; no rule consumes it).
5. `web/package.json` modified + untracked `engine-v2.ts` /
   `PROOF_ENGINE_V2.md` in a local workspace — **not** audited commits; the
   implementer of PEE tasks must reconcile with that unmerged work before
   starting (see PEE-00).
6. Typo allowlist is provably too small: "occurrance", "recieving",
   "seperate"'s siblings are invisible; en-GB legitimate spellings
   (organise/organize) are unhandled because no dictionary exists.

---

## 3. Measurable excellence (engine-level definition)

Adopted from plan §2, made engine-testable. Each dimension has a metric, a
denominator, and a gate. **No pooled accuracy score may ever be reported.**

| Dimension | Metric & denominator | Beta floor | Promotion target |
|---|---|---|---|
| Correction safety | unsafe corrections / adjudicated eligible correction cases, per rule, per language | 0 observed in ≥1,000 cases; report binomial 95% upper bound (≤3/1,000), never "100% safe" | 0 in ≥10,000, stratified by family |
| Comment precision | TP/(TP+FP) per rule within declared supported scope | ≥98% | ≥99% |
| Comment recall | TP/(TP+FN) per rule, denominator = labelled opportunities in supported scope | ≥90% declared | ≥95% |
| Clean silence | fraction of clean documents with zero findings; false comments per 10,000 supported words | ≥95% / ≤0.2 | ≥98% / ≤0.1 |
| Anchoring | findings whose `exactQuote` reconstructs from source nodes / all published findings | 100% (already enforced by `validateSourceSpan`) | 100% incl. non-main stories |
| Fidelity | lost structures, unexpected diffs, Word repair prompts in fixture matrix | 0 | 0 across expanded matrix |
| Suppression honesty | runs with any suppressed rule showing coverage `limited` + reason codes / all such runs | 100% (already enforced) | 100% |
| Speed | P95 wall time within `PROOF_LOCAL_MAX_PROCESSING_MS` budget, cold start included | ≤30 s for 1 MiB text-heavy; ≤90 s at the 100 MiB image-heavy class | ≤30 s at raised limits |
| Cancellation | aborted runs release worker, no partial download | 100% tested | 100% |

Unsafe correction (normative): any unplanned text/structure change,
wrong-location edit, altered name/number/operative phrase, or correction whose
rejection does not restore source semantics.

---

## 4. Target capability matrix

Rows are rule families (detailed in §6). "Lane" = A (build now, evidence
cheap), B (build after indexes), C (evaluate-first experiment), X (blocked /
rejected).

| # | Family | Lane | Action | New engine inputs needed | Maps to |
|---|---|---|---|---|---|
| 1 | Allowlist typos (current 4) | A | correction | none | PWC-15 done; extend |
| 2 | Duplicate function word | A | correction | none | PWC-15 done; extend |
| 3 | Placeholder / incomplete drafting | A | comment | pattern expansion only | PWC-15 extend |
| 4 | Clause-number duplicate/missing target | A/B | comment | PWC-39 reference index | PWC-39/41 |
| 5 | Defined-term duplicate declaration | A/B | comment | PWC-39 definition index | PWC-41 |
| 6 | Undefined-term use / case-variant use | B | comment | definition index | PWC-41 |
| 7 | Party-name consistency (role-bound) | B | comment | party index (new, but from existing party extraction) | PWC-42 |
| 8 | Date validity & words/figures agreement | B | comment | date tokens + adjacent-words pairs | PWC-42 |
| 9 | Amount words/figures, %, currency | B | comment | number-word parser | PWC-42 |
| 10 | Dictionary spelling (en-GB/en-US) | B | comment | nspell + dictionary (§7) | PWC-40 |
| 11 | Punctuation/spacing pairs (closed set) | C | comment/correction | character inventory | PWC-43 |
| 12 | Sentence mechanics (closed set) | C | comment | sentence segmenter | PWC-43 |
| 13 | Schedule/annexure inventory vs references | B | comment | story + heading index | PWC-38/39 |
| 14 | Headings: numbering/parallel-structure | C | comment | heading index | PWC-43 (subset) |
| 15 | Signature-block completeness | C | comment | signature index | new (after PWC-38) |
| 16 | Formatting anomalies | C | comment | style resolution | PWC-43 |
| 17 | Existing unresolved revisions/comments | X→B | notice | modern review metadata | PWC-44 (blocked: preservation proof) |
| 18 | Non-main-story checking | B | — | story map | PWC-38 |
| 19 | Grammar beyond closed sets; semantic/meaning checks; missing non-function words | X | — | — | §10 ceiling; do not build |

Priority rationale: lanes are ordered by (evidence cost) × (lawyer value).
Structural families 4–9 top the list because evidence is the document's own
inventory — precision is achievable deterministically — and these errors cause
real disputes (a wrong cross-reference is a litigation risk; "recieve" is not).

---

## 5. Engine representations and contracts

Existing (verified): `SourceParagraph` + node editability/revision flags,
`SpanV2` (`proof-projection-v1`, view `final`), `ScopeEvidenceV2` with
completeness inventory, `ProofFinding` strict schema, export plan schema.
**These stay.** New/extended representations, all additive and versioned:

1. **RE-1 Visible text + spans (extend, do not replace).** Keep
   `textStart/textEnd` offsets into paragraph text; add `nodeIds[]` to spans so
   corrections pin to run identities, not just offsets (protects against future
   multi-pass edits within one run). No destructive normalisation anywhere:
   the only permitted derived text forms are (a) exact substring quotes and
   (b) explicitly-labelled normalised keys (lowercased, punctuation-stripped)
   that are used **only for comparison**, never exported or quoted.
2. **RE-2 Paragraph/sentence/table segmentation.** Add a sentence segmenter
   over `SourceParagraph.text` producing `[start,end)` segments with
   quote-protected and abbreviation-aware boundaries ("Ltd.", "cl.", "No.",
   "p.", numbered subclauses "(a)", "1.1.2"). Tables already carry paragraph
   paths through cell scoping; the segmenter must never join text across
   cells. Contract: every sentence id = (partUri, storyId, paragraphPath,
   start, end) — no new identity beyond existing span coordinates.
3. **RE-3 Heading/numbering/clause hierarchy (PWC-39).** Scoped numbering index
   with restart-aware resolution; scope = existing paragraph `scope`. Contract:
   resolution result ∈ {`resolved`, `missing`, `ambiguous`, `external`},
   never a guess. Native numbering labels stay derived metadata (already
   enforced: `numbering_source_mismatch` throw).
4. **RE-4 Definitions index (PWC-39).** Inventory of declarations
   (`X means …`, `"X"`, `X shall mean`), each with declared scope and span.
   Nested/imported definitions recorded as separate entries with parent links.
   Duplicate detection stays declaration-level; use-analysis rules consume this
   index rather than re-scanning.
5. **RE-5 Party index (new).** From existing party extraction paths: role
   ("Purchaser"), full legal name, short name, defined-term binding, signature
   block occurrence, per-scope. Keyed on declared definitions, never on
   string similarity.
6. **RE-6 Figure/date index (new).** Tokens for dates, amounts, currencies,
   percentages with exact spans and a parsed canonical value **per local
   format declared by the document** (no global assumption; dd/mm vs mm/dd
   ambiguous → `ambiguous`, not parsed).
7. **RE-7 Language & boundary model (existing, extend).** Per-paragraph
   language (already used by `explicitEnglish`), style-based region
   classification (already: heading/address/signature), protection from node
   flags (already). Add: region kinds `quote`, `definition_label`,
   `signature_block`, `schedule_heading` as **labels for exclusion**, never as
   authority to edit.

All indexes are built once per run, versioned (`proof-index-v1` prefix with
per-index suffix), serialised in the run receipt, and must be pure functions of
(`source`, `extracted`) so the JS validator, tests, and any future R2 worker
(§11) reproduce them bit-identically. Index builders get their own budgets
(one pass, O(paragraphs), memory proportional to inventory size).

---

## 6. Detailed rule catalogue

Common contract for every rule (mirrors `LaunchRuleSpec`, extended):

```
id, version, family, profile, languages, phase, defaultEnabled,
requiresCapabilities, requiresIndexes, evidenceTier, actionPolicy,
maxCandidates, timeBudgetMs, exclusions[], evaluation receipt hash
```

Promotion requirements (§8) apply to every rule listed. Per-rule details below;
each is later instantiated as its own `launchSpec` in a versioned registry
file. **Numeric difference alone never establishes an inconsistency — every
figure/date rule requires label or role evidence that the two tokens denote
the same referent.**

### 6.1 `language.typo_allowlist` v2 — extended allowlist (Lane A)

- **Value:** fixes the most frequent absolute typos without a dictionary.
- **Algorithm:** whole-token match against frozen map; unchanged guardrails.
  Extend from 4 to a reviewed ~40-entry map (occurrance/recieving/untill/
  Wich/Ths/arguement/begining/compair…), entries only where the typo string is
  **not** a valid en-GB/en-US word and the fix is unique. Version bump to
  `proof-typos-v2`; corpus regenerated.
- **Exclusions:** all current `ordinaryProse` guards (quotes, party blocks,
  URLs, non-Latin, definition labels, re-used defined terms).
- **Traps:** `Seperate` as a party's quoted trade name; `Tehran` (word
  boundary); `recieve` inside a quotation of a message.
- **Action:** tracked correction, exactly as v1.
- **Eval:** ≥200 positive and ≥200 clean-trap cases across families; promotion
  at precision ≥99.5% and zero unsafe in adjudicated set.

### 6.2 `language.duplicate_word` v2 (Lane A)

Extend `DUPLICATE_FUNCTION_WORDS` cautiously (add `that, which, is, to be`
variants); keep function-word-only scope. Handle tab/space mixtures between
duplicates by extending the separator class from ASCII space to
`[ \t\u00a0]+` — **correction must delete only the duplicate token span, not
the whitespace run** (anchor `textStart` at second token start). Legitimate
repetition traps: "that that" in legal prose ("provided that that
condition…") stays in scope only if adjudicated; until adjudicated, exclude
`that`. Evidence tier stays exact-mechanical.

### 6.3 `completion.placeholder` v2 (Lane A)

Extend patterns: `[…]`, `[●]`, `[insert *]`, `[TBD*]`, `[draft*]`,
`___`/`———` runs ≥4, `XX.XX`, `‹ ›`, `{*}` — each pattern versioned, each
exclusion recorded (underscored signature lines are *not* placeholders; table
rule lines are not). Comment-only. Keep the current finding text style:
quote + instruction, no interpretation.

### 6.4 `references.*` v2 — cross-reference integrity (Lane B; PWC-39/41)

- `references.missing_target`: use the PWC-39 reference AST: single, range
  (`1.2 to 1.4`, `1.2–1.4`, `1.2 and 1.5`) — a range is flagged only if
  **both** endpoints are missing, and the comment names both. External
  references (other agreements/statutes) excluded exactly as today
  (`references.missing_target` already excludes external/range/coordinated —
  the index unlocks the excluded classes).
- `references.duplicate_number`: current rule kept; add numbering-inventory
  duplicates across literal vs auto-numbered labels.
- **New** `references.scope_confusion`: reference to a label that exists in a
  *different* scope only (e.g. "Clause 3" unique in Schedule 2, referenced in
  main body where Clause 3 does not exist). Comment names both scopes.
- **Traps:** `Schedule`-prefixed numbers (different namespace — must never
  resolve against clause numbers); "the other Agreement"; sub-numbering gaps
  intentionally reserved; `Clause 3.1.2` where 3.1.1 exists but numbering
  skips (a *gap* is a low-confidence comment only when the skipped number is
  referenced elsewhere — otherwise silence).
- **Action:** comment-only. **Dependency:** PWC-39 index. **Denominator:**
  labelled reference opportunities in supported scope.

### 6.5 `definitions.*` v2 (Lane B; PWC-41)

- `definitions.duplicate` (exists): add nested-definition awareness —
  re-declaration inside a schedule of a term defined in the main body with a
  *different* text is flagged; identical text is recorded but silent (scoped
  re-definition is legitimate drafting).
- **New** `definitions.unused`: defined term with zero uses outside its
  declaration, **default off** — legitimate in templates and many styles;
  enable only after adjudication shows precision ≥98% on the agreement
  profile.
- **New** `definitions.case_variant`: use of a defined term with wrong
  capitalisation ("the Agreement" vs "the agreement" vs defined "Agreement").
  Only when (a) the term is defined, (b) the lowercase use is not a common
  noun use (exclusion list: agreement, deed, contract, parties, appendix used
  generically), (c) not inside a quotation, (d) not in a heading, (e) not a
  language-tagged non-English paragraph. Comment-only; never a correction —
  capitalisation changes can alter defined-term semantics.
- **Traps:** first-word-of-sentence capitalisation; table headers; a term
  defined in *another* document's excerpt pasted into a schedule; plural uses
  ("the Warrants held…").

### 6.6 `parties.consistency` (Lane B; PWC-42, new rule family)

- **Algorithm:** from RE-5 party index, flag (a) role used with a full name
  that differs (beyond case/punctuation) from the name bound at declaration;
  (b) signature block missing the role entirely when the role appears in the
  operative part; (c) unbound name form used ≥3 times while a similar bound
  form exists — **string-similarity findings stay default-off** pending
  precision evidence; only exact-after-normalisation variants (Ltd/Limited,
  ampersand vs "and", punctuation) are lane-B.
- **Evidence:** both spans as related spans; comment quotes both facts.
- **Exclusions:** third parties, witnesses, registered-office addresses,
  execution blocks before `IN WITNESS`, quoted documents, names inside
  definitions (they may legitimately differ), affiliate shorthand.
- **Action:** comment-only, always. **Traps:** group companies with similar
  names ("XYZ Holdings Ltd" vs "XYZ Holdings Pte Ltd" — different entities,
  must not flag); name+role mismatch where the role is legitimately shared
  ("the Purchaser and the Seller together"); amend-and-restate preambles
  listing prior names.
- **Denominator:** labelled role/name binding opportunities. The existing
  `party_name.docx` fixture gains labels in the PWC corpus.

### 6.7 `figures.date` + `figures.amount` (Lane B; PWC-42)

Two rules, both comment-only:

- `figures.date_invalid`: calendar-invalid dates only (31 February, 30
  February-style; 31 April). Day/month ambiguity (03/04) is **never** flagged
  as invalid — if the day is ≤12 the date is `ambiguous` and silent. Spelled
  month + wrong day ("31 April 2026") is exact-mechanical evidence.
- `figures.words_figures_mismatch`: adjacent words/figures pair where the
  spelled amount, parsed with an exact closed number-word grammar (including
  lakh/crore and "and" handling per declared style), differs from the numeral.
  Only flag when the pair is syntactically bound ("USD 10,000 (ten thousand
  US dollars)" pattern), not merely co-located. Rounding tolerance: zero — the
  pair must match exactly; "approximately USD 10,000 (about ten thousand)"
  binds, still exact. Exclusions: ranges ("USD 10,000–20,000"), tranche
  totals, tables of figures, percentages computed from other numbers (never
  verify arithmetic between different sentences — different referents).
- **Traps:** "one hundred (100) days" (fine — matches); "15 (fifteen) days"
  (mismatch — flag); "USD 1,00,000 (one hundred thousand)" (Indian grouping —
  parse per declared grouping only when the document shows Indian grouping
  consistently; else ambiguous/silent); currency symbol mismatch ("USD
  10,000 (INR ten thousand)" — flag, it's bound in the same pair).
- **Denominator:** labelled bound pairs in supported scope.

### 6.8 `spelling.dictionary` (Lane B; PWC-40)

- **Engine:** nspell (MIT, pure JS, browser-proven) + `dictionary-en-gb` /
  `dictionary-en-us` ((MIT AND BSD) wordlists from ESDB/SCOWL; MIT affix
  packaging) — licence evidence in §7 and to be pinned in
  `infra/proof/dependencies.md`.
- **Algorithm:** tokenise with offsets (existing paragraph text), dictionary
  lookup, **comment-only** suggestions. Never autocorrect; never publish the
  dictionary's first suggestion as authoritative — the comment lists
  candidates, if any.
- **Exclusions (hard):** every current `ordinaryProse` region plus
  defined terms and their uses, party names and signature/address blocks,
  quoted strings, headings/titles, URLs/emails/numbers, non-Latin tokens,
  all-caps acronyms (≥2 letters, no lowercase expansion in doc), tokens
  already inside an existing tracked change, tokens in language-tagged
  non-English paragraphs, and any token that appears ≥3 times in the document
  (a repeated unknown is likely a proper noun of the matter).
- **Run-local exclusions:** "ignore this term" applies to the current run
  only (in-memory set passed to the worker). **Never persisted** — no
  personal dictionary (§ privacy: document-derived vocabulary must not be
  silently written to localStorage/IndexedDB/cookies; if a persisted personal
  dictionary is ever added, it must be opt-in per session with an explicit
  disclosure that terms are stored on the device).
- **Budgets:** dictionary load in the worker, lazy on first spelling run,
  target ≤1 s parse + ≤25 MB heap for both locales (measured in PEE-30 before
  adoption; adoption gate: ≥98% precision on spelling cases, clean silence
  preserved, bundle impact within limits).

### 6.9 `mechanics.*` (Lane C — evaluate-first; PWC-43 subset)

A closed, hand-written set; each pattern independently versioned and
individually promotable/suppressible: double spaces mid-sentence (not after
full stops in monospace), space before punctuation (`. , ; : )`) excluding
leading quote styles, missing space after punctuation (letter-letter
joins only), unbalanced brackets/quotes per paragraph (comment, with count),
mixed straight/curly quotes in the same paragraph, sentence-terminal
double punctuation ("..", ",,") excluding ellipsis "…"/"...", lowercase
sentence start after terminal punctuation (excluding defined-term-led
fragments, list continuations, headings — default-off until adjudicated),
"shall not not"-class double negatives only for the exact token pair
(exclude "no no", quotes).
- **Exclusions common to all:** tables of contents, quoted strings, revision
  nodes, non-main stories (until PWC-38), style-tagged code/monospace.
- **Action:** spacing/punctuation → tracked correction (exact-mechanical);
  anything judgement-adjacent → comment. Each rule needs ≥100 positive and
  ≥100 clean-trap cases before promotion; single failure analysis written
  before re-run.

### 6.10 Existing comments / unresolved revisions (remains PWC-44)

`analyzeProof` refuses modern-review structures today. Engine-side, the only
near-term addition: when classic `word/comments.xml` exists, **do not** insert
a comment whose anchor range overlaps an existing comment's range (overlap
policy already suppresses; extend to external comments). Rule work is blocked
behind preservation proof — not engine work; tracked as X in §4 and not a PEE
task.

### 6.11 Explicitly rejected / deferred rules

- Generic missing-word detection, grammar agreement beyond closed sets,
  readibility/style rewriting, "plain language" suggestions — not
  deterministically establishable at useful precision (§10).
- Any auto-refresh of numbering fields, cross-reference fields, or TOC —
  mutating Word field results is unprovable fidelity-wise; comment-only
  ever.
- Shall/may rewriting, obligation-consistency, cure-period arithmetic —
  semantic/legal judgment; prohibited.
- String-similarity name matching, fuzzy date pairing — below precision
  floor; prohibited until an experiment proves otherwise (and then as a
  default-off rule).

---

## 7. Dependency assessment (browser feasibility)

| Option | Licence | Browser? | Verdict |
|---|---|---|---|
| **nspell** + `dictionary-en-gb`/`-en-us` | nspell MIT; wordlists (MIT AND BSD) from ESDB/SCOWL (wordlist.aspell.net); affix BSD | Pure JS, browserified by upstream; ~1–2 MB gzip total for both locales | **Adopt** (PWC-40 lane; pinned, hashes recorded, notices bundled) |
| Hunspell via WASM (e.g. hunspell.js) | Apache-2.0 engine + per-locale dict licences | Works but heavier; memory/C old | Reject: adds WASM complexity for no gain over nspell |
| LanguageTool (Java) offline | LGPL-2.1+ core; rule data LGPL; n-gram data licence-mixed, large | No: JVM/Java HTTP server cannot run in a browser worker; a hosted LT is a network dependency violating the no-hosted-service contract | **Reject** for browser runtime; may be used *offline in CI* as an evaluation oracle only (no product dependency) |
| nlprule (Rust/WASM subset of LT rules) | Code MIT/Apache-2.0; derived rule binaries LGPL; **project unmaintained since ~2022**; WASM bundles tens of MB, load times seconds-to-minutes on mobile | Technically demonstrated, practically poor | **Reject**: maintenance risk + size + LGPL-derived-data complexity exceed value; revisit only if revived upstream AND measured gains justify |
| Tiny hunspell-free lists (custom) | n/a | Trivial | Keep only as the frozen typo allowlist (already the design) |

**Minimal dependency set: nspell + two pinned dictionary packages, loaded
lazily in the worker, one locale pair per run, hash-pinned, notices shipped in
`infra/proof/dependencies.md`.** No Java, no WASM grammar engine, no hosted
service, no LLM. Any second grammar engine must come through a §8-style
evaluate-first experiment with resource measurements before adoption.

---

## 8. Evaluation and release gates

The corpus system already exists (`corpus/pwc/`: 48 packages, family-hash
splits, honest denominators, `canPromote`). This spec makes the following
**binding for every new rule**:

1. **Case generation.** Each rule ships its own generated case file
   (`corpus/pwc/<rule>-cases.ts`) with: ≥100 positives, ≥100 negative traps,
   spread over ≥5 document families (SHA/SSA/NDA/employment/general letter),
   each family hashed to development/calibration/held_out by the existing
   `splitBucket`. **Repeated templates are counted once per family, not once
   per package** (denominators file already enforces independence labelling —
   keep it). Clean twins for every positive family.
2. **Adversarial packages.** Per rule: at least one package that combines the
   rule's error with (a) an existing tracked change, (b) a table, (c) a
   quotation containing the error, (d) a party block, (e) a non-English-tagged
   paragraph. Each must either suppress with reason or stay silent.
3. **Separate metrics.** Detection (found/not), anchoring (exactQuote
   reconstructs), action correctness (planned edit applies, rejection
   restores) are scored separately per rule; the runner already returns
   per-rule metrics — extend the runner to emit the three-way split.
4. **Held-out promotion.** Promotion uses held_out bucket only, gate:
   precision ≥98% (≥99.5% for any correction rule), recall ≥ declared
   supported-scope recall, minSamples ≥100, zero unsafe corrections in the
   adjudicated correction subset. Failing rules stay `defaultEnabled: false`
   with the reason recorded in the registry.
5. **Reconstruction & Word.** Every promoted rule adds at least one exported
   pair to the Word-verify checklist (Word COM lab check per current
   `proof-word-verify.ps1` pattern). JS reconstruction validation per document
   is unchanged.
6. **Confidentiality.** Synthetic only; no client documents in Git, CI,
   analytics, or permanent test storage (already the law of the repo; restated
   as a gate).
7. **Suppression honesty.** Any suppressed rule must surface in `coverage:
   limited` + reason codes (already enforced); "no issues found" copy must
   always co-present coverage status — new UI copy requirement routed through
   PWC-32's successor work, not this spec's tasks.

---

## 9. Performance plan

Budgets (browser worker, per run): total ≤30 s wall (existing), indexes ≤2 s
per index, per-rule ≤2 s (existing), memory ceiling per the 2026-09-09 Chromium
measurement (≈100× source in extra heap for 1 MiB). Rules:

1. One-pass index builders; rules read indexes, never re-parse the document.
2. Dictionary load lazy, measured before adoption (PEE-30); if it breaks the
   budget, spelling ships as a second staged run (user-visible progress), not
   a silent budget breach.
3. All budgets are receipts in the run record; a rule hitting its cap is
   suppressed with `rule_budget` (existing behaviour) and counted in omitted
   counts.
4. Raising limits: measure first with `npm run proof:capacity-bench` and
   `npm run proof:capacity-browser`, then move the versioned policy in
   `policy.ts`. **Limit changes are lab-measured releases, never
   aspirational edits.** The 2026-09-10 v3 bump is the image-heavy 100 MiB
   class plus an 8 MiB document.xml complexity gate measured on complete
   agreements. The extracted-text gate remains 1e6 code points.

---

## 10. Deterministic ceiling (honest statement)

Proof cannot, and must not claim to: understand meaning; detect substantive
inconsistency between obligations in different clauses (e.g. cure-period
conflicts); judge whether a defined term *should* be used; infer intent
behind a party-name variant; recover a missing non-function word with
confidence; distinguish "and" from "or" errors; validate commercial logic
(amounts, dates in *different* sentences with different referents); handle
semantics-dependent grammar; or assess style. These gaps are **not** closable
by more rules or bigger dictionaries, and are explicitly **not** closed by
model calls in this product. User-facing copy must always describe checks
mechanically ("found a defined term used once but never defined" — not
"checked your agreement for consistency"). Where a rule's precision depends on
a semantic distinction, the rule does not ship.

---

## 11. Portability boundary (future R2/server mode)

The engine must remain pure: all rules take (`source`, `extracted`, indexes)
and return findings; no DOM, no `window`, no worker API inside
`web/src/lib/agmt/`. The worker shell (`web/src/lib/proof-local/`) is the only
browser boundary. If a separately-consented server mode is ever approved, the
same rule modules, evidence validation, resolver and exporter run unchanged
in a Node/Worker host; the only new code is a host adapter (bytes in →
receipt+output out) and consent/privacy copy. **No PEE task may add server
coupling, and this section creates no authorisation to build server
processing.** R2 continues to supply no scanning or compute at launch.

---

## 12. Phased roadmap (PEE tasks)

Rules: implementation lane first, one rule or index per task; each task names
files, contracts, tests, acceptance, evidence, prohibited changes; all map to
PWC work so nothing is duplicated. Every task: run the focused corpus suite +
`npm run typecheck` before claiming completion; ledger entries appended (never
rewritten) per `web/AGENTS.md` rule 7.

**PEE-00 — Reconcile unmerged engine-v2 work.** Inspect untracked
`web/src/lib/agmt/proof/engine-v2.ts`, `engine-v2.test.ts`,
`docs/PROOF_ENGINE_V2.md`, modified `web/package.json` in the working
checkout; either adopt-and-map or record-and-supersede in the ledger before any
PEE-1x task. Prohibited: deleting that work without a ledger decision.

**PEE-01 — Typos v2 + duplicate v2 + placeholder v2 (§6.1–6.3).**
Files: `proof/typo-allowlist.ts`, `proof/launch-checks.ts`,
`corpus/pwc/*-cases.ts`. Extension of shipped rules; no new inputs. Acceptance:
all §8 gates met per rule; Word pair for one new correction. Maps to PWC-15
extension (PWC-15 itself is done — do not redo it).

**PEE-02 — Reference/definition indexes (RE-3/4/5/6).** This is **PWC-39
wholesale** — do not re-specify; this spec adds only RE-5 (party index) and
RE-6 (figure/date index) as two additional index files
(`proof/indexes/parties.ts`, `proof/indexes/figures.ts`) built to the same
contracts.

**PEE-10 — Reference rules v2 (§6.4)** = PWC-41 references half. **PEE-11 —
Definition rules v2 (§6.5)** = PWC-41 definitions half. **PEE-12 — Party
consistency (§6.6)** = PWC-42 parties half. **PEE-13 — Dates/amounts
(§6.7)** = PWC-42 figures half. **PEE-20 — Dictionary spelling (§6.8)** =
PWC-40 wholesale, plus the PEE-30 resource measurement as its first subtask.
**PEE-21 — Mechanics closed set (§6.9)** = PWC-43 subset (evaluate-first).
**PEE-30 — Browser resource re-measurement** (§9.4): extends
`web/scripts/browser-proof-prototype/`; no product change. **PEE-31 —
Non-main stories** = PWC-38 wholesale (unlocks §6.9 scope + signature checks).

Dependency order: PEE-00 → PEE-01 → (PEE-02, PEE-30 parallel) →
PEE-10/11/12/13 (serialised promotions, per PWC-41/42) → PEE-20 → PEE-21 →
PEE-31. Where a PEE task equals a PWC task, the PWC task's ledger entry and
inspection lists control execution; this spec's rule details (§6) are the
additional normative content the PWC tasks do not carry.

## 13. Requirement-to-task-to-test traceability

| Requirement (section) | Task | Test evidence |
|---|---|---|
| §3 correction safety | PEE-01/10/11 | adjudicated correction cases + binomial bound in metrics receipt |
| §3 clean silence | all | clean twins per family in `corpus/pwc/*-cases.ts`, `clean silence` metric in runner |
| §3 anchoring 100% | all | `validateSourceSpan` enforcement (existing) + anchor metric split (§8.3) |
| §5 index purity | PEE-02 | index determinism test: same input → identical receipt, twice, across processes |
| §6 each rule | its PEE task | per-rule §8 case files, held-out `canPromote` gate |
| §7 licence pinning | PEE-20 | `infra/proof/dependencies.md` entries + hash pin + notice text |
| §8 no-pooling | all | denominators file (existing pattern) extended per rule |
| §9 budgets | PEE-30 | measured heap/latency table in ledger |
| §11 purity | all | engine imports lint: no `proof-local`/DOM imports under `lib/agmt` |
| §12 ledger honesty | all | appended ledger entries with commands + exit codes |

## 14. Superseded assumptions

1. *The four-typo allowlist is a launch-adequate spelling surface* —
   superseded: it becomes `proof-typos-v2` (PEE-01) and, separately, a
   dictionary lane (PWC-40) with its own gate.
2. *Grammar engines need evaluation before rejection* — resolved: LanguageTool
   Java and nlprule are rejected on measured browser-infeasibility grounds
   (§7); nspell-only is the adopted dependency set.
3. *Numeric mismatches between different sentences can be flagged* —
   superseded: only syntactically bound words/figures pairs (§6.7) are in
   scope; cross-sentence arithmetic stays out (§10).
4. *Recall over general English errors is a target* — reaffirmed as
   explicitly not a target (plan §2 already says this; restated because every
   new-rule proposal will be tempted).
5. *The 25 MiB server ZIP limits describe the product* — superseded: the
   browser limits (`proof-local-limits-v1`) are the only citable ceilings.
6. Nothing in this spec supersedes: zero-LLM, browser-only processing, free
   launch, four-month spending freeze, Hostinger/Containers exclusions,
   must-not-change list (including `scanning→processing`).

## 15. Attack-test review (pre-finalisation)

**As a transactional lawyer:** the rules I most want — party-name mismatch,
broken cross-references, invalid dates, words/figures mismatches — are lanes
A/B and land first; the spec never rewrites my operative language silently
(every comment quotes evidence; every correction is rejectable and tested to
restore source). Signature-block and schedule-inventory checks are visibly
deferred, which I'd rather know than be promised.

**As a document engineer:** every new input is additive and versioned; no
destructive normalisation (only labelled comparison keys); anchor extension
(nodeIds) is backwards-compatible; index determinism and the existing
reconstruction validator cover fidelity; PWC-44 review-structure refusal is
not weakened. One risk flagged and closed: duplicate-word whitespace handling
now pins deletion to the second token span, not the separator (§6.2).

**As an evaluator hunting inflated accuracy:** the spec forbids pooled scores,
requires pre-registered denominators with independence labelling, separates
detection/anchoring/action metrics, and requires held-out-only promotion with
binomial uncertainty language. No rule can claim 100%: `not_evaluated ≠ 100%`
is already code. Confirmed: no repeated-template inflation path survives the
denominators file.

**As a smaller coding model implementing this:** every task names its PWC twin
(so no duplicate work), exact files, gates and prohibited changes; the riskiest
ambiguity is PEE-00 (unmerged engine-v2 work) and it is the explicit first
task. What a smaller model still could get wrong — hand-writing new cases with
templated repetition — is blocked by the denominators gate.

**Remaining genuine decisions (founder/engineer, not resolved here):**
1. Whether "that that" and `definitions.unused` deserve default-on promotion
   (evidence-gated, currently default-off). 2. Whether a persisted personal
   dictionary is ever offered (currently prohibited without explicit consent
   flow). 3. When to schedule PEE-30 limit re-measurement (no product need
   until a rule exceeds the 1 MiB class in practice).
