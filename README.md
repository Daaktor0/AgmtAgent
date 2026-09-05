# Agmt - an agent for your words

**v1 web (Slice 0)** lives in [`web/`](web/). Sign-in, Matter, native DOCX ingest,
canonicalisation map and deterministic Proof. No model call. The Word add-in below
is legacy and is not the v1 launch surface.

---

A drafting partner that lives in the right-hand pane of Word and works to one
specific skill: **Agreement Review & Drafting**. It reads the whole document,
reasons about it as one contractual system, and proposes the smallest defensible
intervention. You accept each change with a click; it never writes to your
document on its own.

Setup instructions are in **[SETUP-WINDOWS.md](SETUP-WINDOWS.md)**.

---

## What it actually does

The skill file — `skill/AGREEMENT-SKILL.md`, yours, verbatim — is the system
prompt. Everything below exists to let a model follow it properly rather than
skim a document and produce plausible-sounding markup.

**A supervisor model owns the mandate and the plan.** Not a pipeline. It decides
what to read, what to search, what to hand off, and when it has enough. That is
what makes it survive the non-linear cases: a concern raised in Clause 9 that
turns out to belong in the definition of Loss, an indemnity trigger that
duplicates a warranty three schedules away.

**It works through tools, not a dump of the text.** The document is exposed as:

| Tool | What it does | Which part of the skill |
|---|---|---|
| `get_outline` | Full architecture: every clause, schedule, paragraph range | §5 Step 1, deal map |
| `read` | Exact text of a clause or paragraph range | — |
| `get_definition` | A definition **plus every paragraph where it operates** | §5 Step 2 |
| `search_document` | Every place a concept appears | §5 Step 4, overlap check |
| `run_mechanical_checks` | Exact, non-model defect scan | §6 Modes J and N |
| `delegate` | Hands a bounded slice to a worker model | breadth over long schedules |
| `record_issue` | Structured output, verified against the text | §10 output rules |
| `ask_user` | Raises a mandate gap or factual point | §5 Step 3 |

**The mechanical layer is deterministic.** No model is involved, so nothing in
it can be hallucinated:

- broken cross-references (`Clause 11.2` where there is no Clause 11)
- figure-versus-words amount mismatches, including lakh and crore
- unfilled placeholders — `[●]`, `[insert]`, `TBD`
- numbering gaps and duplicate clause numbers
- duplicate definitions, and defined terms never used
- defined-term case drift ("Business Plan" vs "business plan")
- Title Case phrases used like defined terms with no definition

Run it on its own with **Mechanical checks** — instant, no model call, no cost.
It is the fastest useful thing in the tool for a pre-signing pass.

**Quoted wording is verified before you ever see it.** When the model proposes an
edit it must quote the existing words exactly. The server checks that string
against the document. If it does not appear verbatim, the issue is flagged and
the insert button is withheld — so you cannot accept an edit built on wording the
model imagined.

**Nothing lands without a click.** Applying an edit turns on Word's change
tracking and inserts it as a tracked change. Bubble comments go in as real Word
comments. Reject All undoes everything.

## Modes

All fourteen from §6 of the skill, in the dropdown:

A full review · B clause review · C drafting · D surgical inline amendment ·
E bubble comments · F counterparty markup · G negotiation strategy ·
H call prep · I interpretation · J consistency check · K proofreading ·
L version comparison · M email summarising changes · N pre-signing QC

## Models

The tool is model-agnostic through OpenRouter — one key, every provider.

Four roles, each independently configurable:

- **supervisor** — the head. Holds the mandate, plans, prioritises, does final QC.
  Give this your strongest model; it is where the judgement lives. Must support
  tool calling.
- **analyst** — reads a bounded slice and reports.
- **drafter** — produces clause language.
- **extractor** — bulk classification. Cheap and fast.

Left on **auto**, a role resolves at run time to the newest live model in a
preferred family (Claude Opus first for the supervisor, then GPT, Gemini, Grok).
Because the preference list holds family prefixes rather than versions, it picks
up new releases without an update. Pin any role to an exact model in Settings if
you would rather freeze it.

**On accounts:** a ChatGPT, Claude or SuperGrok *subscription* cannot be used
here — consumer subscriptions carry no programmatic access. OpenRouter is one API
key that reaches all of those models, which is why it is the single dependency.

## Confidentiality

Worth being deliberate about, given what you will point this at.

- The document text goes to whichever model provider you select, via OpenRouter.
  Nowhere else. Your API key sits in `config.yaml` on your machine.
- Everything else — parsing, mechanical checks, issue storage — happens on
  `127.0.0.1`. There is no cloud component to this tool.
- Set your data policy at <https://openrouter.ai/settings/privacy>. Turn off
  prompt logging, and consider restricting to zero-data-retention providers
  before running client documents through it.

## What has and hasn't been tested

Tested end to end, offline: document parsing, all mechanical checks, the number
parser, the supervisor loop against a stubbed model (including that it rejects an
invented quotation), the system prompt assembly, and the HTTPS server serving both
the API and the pane. Run `python -m tests.test_pipeline` yourself.

Not testable where this was built, so verify on first run: the live OpenRouter
calls, and the Word insertion path (tracked changes and comments) inside real
Word. If a tracked-change insert misbehaves, tell me what it did — the search and
anchoring logic in `addin/taskpane.js` is the place to adjust.

Comment insertion needs WordApi 1.4 (Microsoft 365 or Office 2021+). On older
Word the pane detects this and offers **Copy comment** instead.

## Layout


```
agent/document.py     deterministic parsing and checks — no model
agent/tools.py        tool schemas and dispatch, quotation verification
agent/supervisor.py   the agentic loop and all fourteen mode briefs
agent/router.py       OpenRouter client, live model resolution
server/app.py         local HTTPS server: API + task pane
addin/                manifest and Word task pane
skill/                your skill, used verbatim as the system prompt
tests/                offline test suite
```

To change how it behaves, edit `skill/AGREEMENT-SKILL.md` and restart
`start.ps1`. That file is the agent.

## Google Docs

Not built. Google Apps Script runs on Google's servers and cannot reach a
program on your PC, so a Docs version needs either the model calls made directly
from Apps Script (key stored in Google's script properties) or this server hosted
somewhere reachable. It is also materially weaker for this particular skill:
Docs has no true tracked-changes API, so surgical markup — the core of Mode D —
degrades to suggestions. Say the word and I'll build it, but Word is the right
home for this work.

## Production architecture (v2)

The server is a durable, testable service — not just a local script.

```
agent/
  document/          deterministic engine: patterns, model, segmentation,
                     helpers, ingest, versioned check registry
  memory/            SQLite store with checksummed migrations, run events,
                     checkpoints, matter/document/version repositories
  runtime/           request context + local pairing auth
  schemas/           typed contracts shared with the add-in
  contextual/        selection-aware command pipeline
  actions/           safe Word write protocol: tickets, prepare/verify
  gateway.py         provider gateway with usage provenance
  secrets.py         credential-store adapter (keyring; plaintext opt-in)
  worker.py          durable background runs: replay, cancel, stale reaping
server/
  app.py             FastAPI app: API + task pane + SSE streams
  middleware.py      security headers, request ids, error envelopes, body cap
addin/               Word task pane and Agmt-owned Office.js library
```

### Running tests

Every module has an offline test. Run them all:

```
python tests/test_pipeline.py        # core pipeline
python tests/test_golden_slice.py    # contextual golden flow
python tests/test_contract_freeze.py # API/schema freeze vs fixtures
python tests/test_eval_gates.py      # anchor/overlap 1.00 gates
python tests/test_migrations.py      # schema migration incl. legacy upgrade
python tests/test_auth.py            # pairing/auth gate
python tests/test_events.py          # event persistence + resume
python tests/test_secrets.py         # credential adapter
python tests/test_gateway.py         # provider provenance
python tests/test_registry.py        # check registry integrity
python tests/test_evidence_contract.py  # anchor/provenance invariants
python tests/test_reviewer_evidence.py  # reviewer evidence re-read
python tests/test_matters.py         # matter/document/version repos
python tests/test_worker.py          # durable runs, replay, cancel
python tests/test_hardening.py       # headers, envelopes, payload cap
python -m agent.eval checks --corpus eval/corpus   # 29/29 must-finds
```

### Deployment

The current Agmt platform is the TanStack app in `web/`. Cloudflare deployment
must build that directory with Nitro's `cloudflare_module` preset; the root
Worker no longer deploys the legacy Python task pane. From the repository root:

```
npm run build
npx wrangler deploy --config web/.output/server/wrangler.json --keep-vars
```

`npm run deploy` performs both commands. Configure the server-only Postgres,
Better Auth and encryption secrets in Cloudflare before enabling authenticated
workflows. The generated Worker fails closed when those values are absent.

The Docker image and Render blueprint remain available for the legacy local
task-pane service; they are not the current web product deployment.
