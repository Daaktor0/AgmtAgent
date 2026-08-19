# 07 — Release checklist

Ordered, tickable gates for declaring v2.0. Every item names
the command or artefact and the pass condition. Plan basis:
section 17 (1458–1485) and section 13.1 (1134–1210).

Eval command split (do not invert):

- `python -m agent.eval` exposes three subcommands: `checks`,
  `run`, `diff` (`agent/eval/__main__.py` 1, 14–16, 22).
- `checks` prints the must-find / trap line only
  (`agent/eval/checks.py` 49–60) and returns 0 iff every
  must-find matched and no trap fired.
- `anchor_pass_rate` and `overlap_compliance` are computed on
  the scored `run` path (`agent/eval/harness.py` 125–126,
  `agent/eval/metrics.py` 199–200) and printed by
  `agent/eval/report.py` 39–40.

Therefore: the 29/29 must-finds gate pairs with
`agent.eval checks`. The two 1.00 gates pair with
`agent.eval run`. Attaching 1.00 to `checks` is a fabricated
pass condition.

Interpreter: `.venv/Scripts/python.exe`.

## Known CI hole

`.github/workflows/eval-checks.yml` currently runs:

```
python -m agent.eval checks --corpus eval/corpus
python tests/test_pipeline.py
```

It does **not** run `python -m agent.eval run` as a named
gate, and it does not read `reports/eval-run.json`.
`tests/test_pipeline.py` 616–617 does call
`tests.test_eval_run.test_eval_run`, which invokes
`agent.eval run` (`tests/test_eval_run.py` 143–150) but only
asserts exit 0 and that the metric **keys** exist (lines
120–131). It does not assert `anchor_pass_rate == 1.0` or
`overlap_compliance == 1.0`.

`agent/eval/__main__.py` 70–75: `run` currently always
exits 0, including after printing a load/parse exception.
CLI exit 0 is not a 1.00 gate. The 1.00 gates must
inspect `reports/eval-run.json` until the CLI grows a
threshold flag.

`.github/workflows/deploy-preview.yml` builds and pushes a
container. It runs no tests.

## Checklist

Use the interpreter above. Tick in order. Items marked
**BLOCKED** cannot run until the named section 14 commit
exists.

### 1. Current suite green

- [ ] ` .venv/Scripts/python.exe tests/test_pipeline.py `
  - Pass: last line `ALL PASSED`, exit 0.
  - Today this is the whole offline suite
    (`tests/test_pipeline.py` 607–627), including the
    eval-run matcher via the import at 616–617.
- [ ] ` .venv/Scripts/python.exe tests/test_eval_run.py `
  - Pass: last line `ALL PASSED`, exit 0.
- [ ] ` .venv/Scripts/python.exe -m agent.eval checks --corpus eval/corpus `
  - Pass: exit 0. Required now because CI names this step
    separately (`.github/workflows/eval-checks.yml` 17–19).
- [ ] After pytest is added (plan 1136–1138):
  ` .venv/Scripts/python.exe -m pytest `
  - Pass: exit 0. **BLOCKED** until the first commit that
    adds pytest as a dev dependency. Keep the two scripts
    above green until CI migration is complete.

### 2. Deterministic corpus — 29/29 must-finds, 0 trap fires

- [ ] ` .venv/Scripts/python.exe -m agent.eval checks --corpus eval/corpus `
  - Pass: exit 0 and stdout ends with
    `overall: found 29/29 must-finds, missed 0, trap fires 0`
    (`agent/eval/checks.py` 58–60).
  - 29 is the live labelled must-find count:
    `sample_sha` 6 + `synth_dates` 8 + `synth_fidelity` 4 +
    `synth_v2` 7 + `synth_xdoc` 4. After artefact 3
    documents are acquired, the printed `N/N` must still
    be complete (zero misses, zero trap fires). Do not
    retire the 29/29 line until the new labels are in
    `eval/corpus/` and this command prints the new
    denominator.

### 3. `anchor_pass_rate` and `overlap_compliance` both 1.00

- [ ] ` .venv/Scripts/python.exe -m agent.eval run --corpus eval/corpus --mode A --out reports/ `
  - Pass: `reports/eval-run.json` `overall.anchor_pass_rate`
    is `1.0` and `overall.overlap_compliance` is `1.0`.
    Confirm on stdout (`report.py` 39–40) **and** in the
    JSON. `agent.eval run` currently always exits 0,
    including on load/parse failure; the JSON read is the
    only 1.00 gate.
  - Optional after a dump exists:
    `--dump tests/fixtures/eval_dump.json` still has to
    hold both ratios at 1.00.
- [ ] Promote this JSON read into CI. **BLOCKED** on a CI
  commit after commit 11 (plan 1330: “anchor_pass_rate and
  overlap_compliance are 1.00 on the corpus”). Until then
  this item is a local release gate only.

### 4. Current v1 SQLite DB upgrades with no data loss

- [ ] Empty-database apply-all-migrations test.
  - Pass: a fresh file receives every migration and
    `/api/health` (or the runner’s schema-version probe)
    reports the head revision. **BLOCKED** on commit 3
    (`feat: add SQLite migration runner with legacy
    baseline`, plan 1312).
- [ ] Upgrade the artefact-2 legacy fixture (sibling path
  under `tests/fixtures/contract/`) with
  the commit-3 runner.
  - Pass: every pre-upgrade `run`, `issue`, `disposition`
    and `position` row is still present; no destructive
    reset (plan 1143–1145, 1454, 1464). **BLOCKED** on
    commit 3 plus artefact 2.
- [ ] Re-run the same upgrade. Pass: idempotent, no row
  change. **BLOCKED** on commit 3.
- [ ] Checksum-mismatch fixture refuses to start.
  **BLOCKED** on commit 3 (plan 1147).

### 5. Add-in manifest validation

- [ ] `addin/manifest.xml` and `catalog/manifest.xml` are
  byte-identical, or generated from one source (plan 910–
  912). Check today: they already match (both Version
  `1.1.2.0`, same `Id`, same Home-tab button).
- [ ] `npx --yes office-addin-manifest validate "addin/manifest.xml"`
  - Pass: validator reports the manifest is valid.
    Today this can already be run against the v1
    manifest. After commit 19 it must still pass with
    shared runtime, `ContextMenuText`, and the shortcut
    ExtendedOverrides block (plan 915–923).
- [ ] Same command on `catalog/manifest.xml`. Pass: valid,
  and still a byte-level copy (or generated twin) of
  `addin/manifest.xml`.

### 6. API contract tests against the frozen snapshots

- [ ] The artefact-1 snapshot suite (sibling path under
  `tests/fixtures/contract/`) is loaded by a test that
  fails on shape drift of the event stream, issue
  payload, mechanical finding, settings, and Word
  ingest body.
  - Pass: that test exits 0 against HEAD.
    **BLOCKED** on commit 1 (`test: freeze v1 contract
    snapshots`, plan 1310).
- [ ] After commit 2 (`feat: add typed schemas and API
  error envelopes`, plan 1311): invalid payloads fail
  deterministically; old `/api/review` and `/api/checks`
  still serialize through adapters. Pass: the snapshot
  tests remain green **and** a dedicated invalid-payload
  case fails closed.
- [ ] After commit 17: `202` run creation, SSE replay from
  `Last-Event-ID`, reconnect after worker restart, cancel
  and disposition authorization, stale `prepare` returns
  a 409-style body (plan 1201–1209). **BLOCKED** on
  commit 17 (and commit 16 for the stale-action case).
- [ ] After commit 4 / 22: unpaired local request fails;
  pairing token expiry, revocation and origin checks
  have tests (plan 1209, 1313). **BLOCKED** on those
  commits.

### 7. Word anchor / stale-write tests

- [ ] Tests covering plan 1164–1172:
  block ID and unique local ID resolution; scoped exact
  match; duplicate exact text; stale document hash;
  quote/hash mismatch; smart-quote / formatting-run
  differences; document-wide fallback requires
  warning/confirmation; post-write text verification
  and idempotent retry.
  - Pass: every case named above has an assertion, and
    a stale or duplicate match cannot write.
    **BLOCKED** on commit 16 (`feat: add version-safe
    Word action protocol`, plan 1335). Commit 11 lands
    the evidence invariants the tests will call.
- [ ] `record_issue` still rejects the current bad cases
  in `tests/test_pipeline.py` 306–390 (invented
  `old_text`, missing `old_text` on revise, thin
  consequence, `new_text` without `overlap_trace`,
  out-of-range `para`, unresolved ref). Pass: those
  assertions stay green on every later commit.

### 8. Word host smoke tests (artefact 4)

Manual / host matrix. Not an assumed CI capability
(plan 1251–1254). Run per host in artefact 4: Windows
desktop Word, Mac desktop Word, Word Online.

- [ ] Home command opens the pane (plan 1258).
  **BLOCKED** on commit 19 for the new “Open Agmt /
  Ask Agmt” labels; today’s Home “Review” button
  (`addin/manifest.xml` 52–67) can be smoked now.
- [ ] Context-menu command sees the selected range
  (plan 1259). **BLOCKED** on commit 19.
- [ ] Shared runtime survives pane navigation
  (plan 1260). **BLOCKED** on commit 19.
- [ ] Selection is captured before a companion `release`
  (plan 1261). **BLOCKED** on commits 22–23.
- [ ] Comments and tracked changes are inserted only
  after approval (plan 1262, 1477). **BLOCKED** on
  commit 16. Today `taskpane.js` 613–614 still writes
  on the button click with no prepare/confirm token.
- [ ] Word undo reverses the change (plan 1263;
  artefact 4 undo row). **BLOCKED** on commit 16 for
  the verified-write path. Native undo is `unverified`
  on all three hosts (Windows/Mac programmatic
  `Document.undo` is WordApiDesktop 1.4 only). A fail
  here is a host-boundary, not a silent pass.
- [ ] A stale version blocks the write (plan 1264).
  **BLOCKED** on commit 16.
- [ ] Capability probe: on a host missing WordApi 1.4
  comments or WordApi 1.6 `getTrackedChanges`, the pane
  shows the exact degraded banner from artefact 4 and
  `POST /api/checks` (or the v2 ingest) returns a
  suppressed row for `exec.unresolved_comment` /
  `exec.pending_tracked_change`. It must **not** print
  “No mechanical defects found.”
  (`taskpane.js` 429–431 is the current wrong empty
  state.) **BLOCKED** on commit 15 for the banner;
  the suppression rows already exist in
  `check_registry.py` 120–125.

### 9. Remaining section 17 bars (not covered above)

- [ ] Every run has a durable status, event sequence,
  usage/cost record and provider provenance
  (plan 1465–1466). **BLOCKED** on commits 5 and 7.
- [ ] A run resumes after pane close and service restart
  (plan 1467). **BLOCKED** on commit 17.
- [ ] Every model issue has a document version and
  provenance (plan 1468). **BLOCKED** on commits 11
  and 13.
- [ ] Every proposed edit has an exact quote, verified
  anchor, overlap trace and action precondition
  (plan 1469). **BLOCKED** on commits 11 and 16.
- [ ] Typed selection-aware commands work **without**
  the native companion (plan 1474, 1383–1385).
  **BLOCKED** on commits 18–20. Voice is v2.1
  (plan 1482–1484).
- [ ] The example indemnity / double-recovery request
  reaches the Agmt Standard evidence loop and returns
  related-provision navigation (plan 1475–1476).
  **BLOCKED** on commit 20.
- [ ] A capability-degraded document visibly reports
  suppressed checks (plan 1472). **BLOCKED** on
  commit 15.

## Commit unlock map

| Checklist item | First commit that unblocks it |
|---|---|
| 1 current scripts / `checks` | already runnable |
| 2 29/29 must-finds | already runnable |
| 3 1.00 JSON gate in CI | 11, then a CI follow-up |
| 4 v1 DB upgrade | 3 |
| 5 manifest validate (v1) | already runnable |
| 5 manifest validate (v2 surfaces) | 19 |
| 6 contract snapshots | 1 |
| 6 typed error envelopes | 2 |
| 6 pairing / origin | 4 (local), 22 (companion) |
| 6 async run / SSE / 409 | 16 (stale prepare), 17 (runs) |
| 7 Word anchor / stale write | 16 (invariants from 11) |
| 8 host smoke (pane / menu / runtime) | 19 |
| 8 host smoke (writes / stale / undo) | 16 |
| 8 host smoke (companion selection) | 22–23 |
| 8 degraded-capability banner | 15 |
| 9 durable run / resume | 5, 7, 17 |
| 9 typed Contextual Command | 18–20 |

v2.0 may be declared only when every non-voice item
above is ticked. Native push-to-talk is v2.1 unless
commits 22–24 also pass artefact 6’s security gates
(plan 1482–1484).
