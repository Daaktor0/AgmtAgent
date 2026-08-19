# v1 contract snapshots

Machine-generated fixtures of the current-branch Store, supervisor event
stream, mechanical findings, settings surface, and Word add-in payload.

Do not edit the JSON or SQL files by hand. Regenerate:

    .venv/Scripts/python.exe tests/fixtures/contract/generate.py

Drift check (exit 0 iff the committed files match a fresh generation):

    .venv/Scripts/python.exe tests/fixtures/contract/generate.py --check

Materialize a real SQLite file from the committed dump (path is the only
output allowed outside this directory):

    .venv/Scripts/python.exe tests/fixtures/contract/generate.py --build-db PATH

A binary `.sqlite3` is not committed. SQLite page bytes are not reproducible,
so the fixture is `legacy_v1.sql` (`sqlite3.Connection.iterdump()`), and
`--build-db` rebuilds a database from it.

The generator is cwd-independent (paths resolve from this file) and uses
`.venv` only as the interpreter you invoke. It writes nothing except the
files listed below (plus `--build-db PATH`). Temp working copies are deleted
before it exits.

## Files

| File | Source |
|---|---|
| `v1_events.json` | `Supervisor.run` over `tests/sample_sha.txt` with the test-pipeline stub router (offline). |
| `v1_issues.json` | `issues` on the `done` event of that same run. |
| `v1_mechanical_findings.json` | Every corpus dir under `eval/corpus/` except names starting with `_`. For each doc: `load_corpus` → `build_document(doc.ingested, doc_id=...)` → `mechanical_checks()` → `normalize_issue`. Keyed by corpus name. |
| `v1_settings.json` | FastAPI TestClient: `GET /api/health`, stubbed `GET /api/models`, `POST /api/settings` with body `{}`. Plus `Config` field names, `Config()` defaults, and the `Settings` model JSON Schema. |
| `v1_addin_payload.json` | `ReviewRequest.model_json_schema()`, one `ReviewRequest` dump built from `tests/sample_sha.txt`, and the keys `addin/taskpane.js` `payload()` actually sends. |
| `v1_store_schema.sql` | `sqlite_master` DDL after `Store` creates its schema. |
| `legacy_v1.sql` | Full `iterdump()` of a temp DB populated only through Store public methods (`save_run`, `add_disposition` via `record_disposition`, `upsert_position` via `promote`). |

## Normalization

Applied to every fixture before write. JSON is serialized with
`sort_keys=True`, `indent=2`, `ensure_ascii=False`, and a single trailing
newline. SQL dumps get the same string substitutions and a trailing newline.

| Kind | Rule |
|---|---|
| UUIDs / run ids / issue ids | Any RFC-4122 UUID → `<id:N>` with a stable first-seen counter (case-insensitive; the same value always maps to the same `N`). Integer local ids are left alone. |
| Timestamps | ISO-8601 datetimes (`YYYY-MM-DDTHH:MM:SS` with optional fraction and `Z` / offset) → `<ts:N>`, first-seen by exact original string. |
| Absolute filesystem paths | Windows drive paths, UNC paths, and Unix absolute paths that are not `/api…` → `<path>`. |
| Host / port | `127.0.0.1`, `localhost`, `0.0.0.0`, `::1`, with optional `:port` → `<host>`. The `Config.port` integer default is part of the dataclass contract and is not rewritten. |
| Key material | String values under dict keys `api_key`, `openrouter_api_key`, `authorization`, and strings matching `sk-…` / `or-…` → `<redacted>`. Nested objects (for example the JSON Schema for the `api_key` field) are walked, not replaced. |
| `has_key` | Forced to `false` in HTTP snapshots. The live value depends on gitignored `config.yaml` and `OPENROUTER_API_KEY`. |
| `pinned` | Forced to `{}` in HTTP snapshots for the same reason. |

Store clock: `agent.memory.store._now` is patched to a constant for the
process so two runs do not straddle a second boundary and emit a different
number of distinct `<ts:N>` placeholders. UUID generation is not patched;
first-seen mapping makes the dump order-stable.

## Hazards handled here

**H1.** `run_checks` only prints and returns an exit code. Mechanical
findings are produced by replicating its internal path (see table above),
not by calling `run_checks`.

**H2.** `POST /api/settings` with a populated body would write
`config.yaml` (live API key). The generator posts exactly `{}`. Both
`Settings` fields default to `None` and both mutations are `is not None`
guarded, so this is a no-op on disk. The snapshot is the response to `{}`
only.

**H3.** `GET /api/models` calls `router.catalog()`, which hits OpenRouter.
The generator replaces `catalog()` with a fixed in-process list and
replaces `router._client` with an object that raises on `get`/`post`. No
network call is made. In-memory `cfg.prefer` / `cfg.pinned` /
`require_only_free` are reset to code defaults for the request so
`resolved_roles()` does not depend on gitignored yaml; `save_pins` /
`save_key` are never called.

**H4.** `has_key` and `pinned` are machine-local. They are normalized as
in the table. `Config.load()` is not snapshotted as-is; the field set and
constructor defaults are, because `config.yaml` is gitignored.

**H5.** `get_store()` is a process singleton defaulting to `data/agmt.db`.
`AGMT_DB` is set to a temp path before any `agent.*` or `server.app`
import. The legacy fixture uses an explicit `Store(temp_path)` and never
`get_store()`. Connections are closed before the temp directory is
removed, so the real `data/agmt.db` is not opened.

## Limitations

- Settings HTTP snapshot is the empty-body POST only. A populated settings
  write is destructive and is not recorded.
- `/api/models` is the route's transformation of a stub catalogue, not a
  live OpenRouter listing.
- The add-in example uses empty mandate strings and empty list/uid/level
  arrays (no Word host). Conditional `comments` / `revisions` / `tables`
  keys are listed under `taskpane_payload_keys.optional` and omitted from
  `example_as_posted_by_taskpane`, matching `payload()` when those ingest
  channels are unavailable. `example` is the full `ReviewRequest` dump,
  including model defaults such as `comments: null`.
- `legacy_v1.sql` IDs and timestamps are the normalized placeholders, not
  raw uuid4 / clock values. `--build-db` therefore produces a database
  whose TEXT primary keys are `<id:N>`.
