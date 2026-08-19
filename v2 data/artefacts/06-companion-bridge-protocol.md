# 06 — Companion bridge protocol

Wire protocol between the signed native push-to-talk companion
and the Word add-in. Commit 22 (`feat: define companion bridge
protocol`, plan 1351) must be implementable from this file
alone. A fake companion that emits the events below must cause
the add-in to produce the same Contextual Command as typed
input.

Plan basis: section 8.5 (878–889), section 13.4 (1266–1279),
Phase 4 commits 22–24 (1347–1353), risk rows “Durable
transcript exposure” (1450) and “Companion compromise” (1451).
Companion shape: plan 134–149.

This protocol is **intended future behaviour**. Nothing in the
current tree implements it. `addin/taskpane.js` has no bridge.
`POST /api/companion/sessions` does not exist. Commit 4 lands
`/api/auth/pair` first; commit 22 adds the companion routes
and `addin/bridge.js`.

## Transport

Two hops. They are not interchangeable.

1. **Companion ↔ add-in (this protocol).** Loopback only.
2. **Add-in ↔ review host.** Existing / future HTTP
   (`POST /api/companion/sessions` for pairing audit,
   `POST /api/matters/{id}/contextual-commands` for the
   resulting command). The companion never calls the review
   host with document data.

### Why loopback WebSocket

Plan 886–888 prefers “a loopback WebSocket or localhost HTTPS
bridge”. Choose WebSocket as the P1 transport because:

- The add-in runs inside Word’s WebView and cannot accept
  inbound sockets. The companion is a native process and can
  bind `127.0.0.1`.
- Partial transcripts are a stream (plan 1117). HTTP POST per
  partial adds latency and retry ambiguity.
- Binding `127.0.0.1` (not `0.0.0.0`) keeps the channel off
  the LAN. That is the pairing-token’s physical scope.

Default listen address: `ws://127.0.0.1:17321/v1`.
Bind `127.0.0.1` only. Refuse any `Host` that is not
`127.0.0.1` or `localhost`. Port override:
`AGMT_BRIDGE_PORT`. Path is `/v1`. One JSON object per
WebSocket text frame. No binary frames. No document payloads.

HTTPS fallback, same JSON bodies:
`https://127.0.0.1:17322/v1/events` (`POST`) and
`/v1/hello` (`POST`). Use only if the WebView blocks `ws:`.
TLS is a self-signed cert pinned by the pairing handshake
(SPKI hash in `hello_ok.tls_spki_sha256`). The fake companion
in commit 22 implements WebSocket only.

The companion is the WebSocket **server**. The add-in is the
**client**. The add-in connects when the pane/runtime loads
and a pairing token exists; it does not wait for a key press.

## Pairing and authentication

Three tokens. Server stores **hashes only** (plan 830, 1451).

| Token | Issuer | TTL | Scope | Use |
|---|---|---|---|---|
| `pairing_proof` | `POST /api/auth/pair` (commit 4) | 60 s, single-use | `auth.pair` | Proves the add-in is a local trusted pane |
| `pairing_token` | `POST /api/companion/sessions` | 60 s, single-use | `companion.pair` | Shared secret. Frozen rule: `pairing_token == pairing_code` (6-digit). Tests set `AGMT_PAIRING_TOKEN` to that same value. Add-in sends it in `hello`; companion compares it to what the user typed |
| `session_token` | companion, in `hello_ok` | 15 min, rotatable | `companion.events` | Every subsequent frame either way |

### Handshake

1. Add-in, already holding a live `pairing_proof`, `POST
   /api/companion/sessions` with
   `{ "pairing_proof": "...", "runtime_id": "<uuid>",
   "origin": "<taskpane origin>" }`.
2. Server replies `201`:
   `{ "session_id": "<uuid>", "pairing_code": "123456",
   "pairing_token": "123456",
   "expires_at": "<RFC3339>" }`.
   `pairing_token` and `pairing_code` are the same 6-digit
   string. Persist `sha256(pairing_token)`, never the
   token. Show `pairing_code` in the pane.
3. User types `pairing_code` into the companion (fake
   companion: env `AGMT_PAIRING_TOKEN` is that same
   6-digit value). Companion does not read the document,
   the pane DOM, or any file the add-in wrote.
4. Companion listens on the loopback port. The add-in
   connects and sends `hello` with
   `token = pairing_token` and `session_id` from step 2.
   Companion replies `hello_ok` only if `hello.token`
   equals the 6-digit value the user entered (or
   `AGMT_PAIRING_TOKEN`). Otherwise
   `error.token_expired` `fatal=true`.
5. `hello_ok` carries a new `session_token` plus
   `{ session_id, expires_at, heartbeat_s: 5,
   token_ttl_s: 900 }`. Subsequent frames use that token.
6. Rotation: at `expires_at - 120s` the add-in sends
   `token_rotate` `{ token: <current>, next_session_token,
   expires_at }`. The companion switches on the next
   outbound frame. Old token is accepted for 30 s, then
   rejected.
7. Revocation: add-in or server `DELETE
   /api/companion/sessions/{id}`. Add-in sends `revoked` and
   closes the socket. Companion wipes tokens and audio.

`session_token` is bound to `session_id` + `companion_id` +
loopback origin. A frame with a valid token for a different
`session_id` is `error.code = "token_scope"`.

Unsigned companions are rejected unless
`AGMT_ALLOW_UNSIGNED_COMPANION=1` (commit 22 fake companion
and tests only). Production (commit 23) requires a verified
Authenticode signature on the companion binary (plan 1451).

## Event schema

Every frame:

```json
{
  "v": 1,
  "type": "hello",
  "session_id": "uuid",
  "utterance_id": null,
  "seq": 1,
  "ts": "2026-08-19T12:00:00.000Z",
  "token": "opaque-or-pairing-token"
}
```

| Field | Type | Rules |
|---|---|---|
| `v` | int | Always `1`. Other values → close. |
| `type` | string | One of the types below. |
| `session_id` | string (uuid) | Server-issued id from `POST /api/companion/sessions`. Required on `hello` and every later frame. |
| `utterance_id` | string (uuid) \| null | Required on press/release/cancel/partial/final. Identifies one hold-to-talk. |
| `seq` | int | Per-connection monotonic from 1. Gap → `error.code = "seq_gap"`; do not process. |
| `ts` | string | RFC3339 UTC. Informational; do not use as a security clock. |
| `token` | string | `pairing_token` on `hello`; `session_token` on everything else. |

Unknown fields are ignored. Unknown `type` →
`error.code = "unknown_type"`; connection stays up.

### `hello` (add-in → companion)

```json
{
  "v": 1, "type": "hello", "session_id": "uuid",
  "utterance_id": null, "seq": 1,
  "ts": "...", "token": "<pairing_token>",
  "runtime_id": "uuid",
  "origin": "https://agmtagent.example",
  "protocol_min": 1,
  "protocol_max": 1
}
```

`runtime_id` is the shared-runtime id (commit 19). `origin`
must match the task-pane origin used at `/api/auth/pair`.

### `hello_ok` (companion → add-in)

```json
{
  "v": 1, "type": "hello_ok", "session_id": "uuid",
  "utterance_id": null, "seq": 1,
  "ts": "...", "token": "<session_token>",
  "companion_id": "uuid",
  "companion_version": "0.1.0",
  "signed": false,
  "heartbeat_s": 5,
  "token_ttl_s": 900,
  "expires_at": "..."
}
```

`signed` is `true` only after commit 23 signature check.

### `press` (companion → add-in)

```json
{
  "v": 1, "type": "press", "session_id": "uuid",
  "utterance_id": "uuid", "seq": 2,
  "ts": "...", "token": "<session_token>",
  "source": "hotkey",
  "hotkey": "Hold Ctrl+Space"
}
```

`source`: `hotkey` \| `overlay` \| `test`.
On `press` the add-in captures the current Word selection
**immediately** (plan 1028, 1115–1116, 1261). It does not
wait for `release`.

### `release` (companion → add-in)

```json
{
  "v": 1, "type": "release", "session_id": "uuid",
  "utterance_id": "uuid", "seq": 8,
  "ts": "...", "token": "<session_token>",
  "duration_ms": 2400
}
```

`duration_ms` is int ≥ 0. A `release` without a matching
open `press` is `error.code = "orphan_release"` and is
ignored.

### `cancel` (either direction)

```json
{
  "v": 1, "type": "cancel", "session_id": "uuid",
  "utterance_id": "uuid", "seq": 4,
  "ts": "...", "token": "<session_token>",
  "reason": "user"
}
```

`reason`: `user` \| `hotkey` \| `disconnect` \| `timeout` \|
`mic_denied` \| `superseded`. Companion wipes the audio
buffer before sending. Add-in discards partials and does
not open a Contextual Command.

### `partial` (companion → add-in)

```json
{
  "v": 1, "type": "partial", "session_id": "uuid",
  "utterance_id": "uuid", "seq": 5,
  "ts": "...", "token": "<session_token>",
  "text": "check this against the indem",
  "stable_n": 18,
  "confidence": 0.61
}
```

`text`: string, max 4000 code points, transcript only.
`stable_n`: int, prefix of `text` that will not shrink.
`confidence`: number 0–1 or null. Out-of-order `partial`
(`seq` not greater than last partial for this
`utterance_id`) is dropped.

### `final` (companion → add-in)

```json
{
  "v": 1, "type": "final", "session_id": "uuid",
  "utterance_id": "uuid", "seq": 9,
  "ts": "...", "token": "<session_token>",
  "text": "check this against the indemnity clause",
  "confidence": 0.88,
  "alternatives": []
}
```

`alternatives`: array of `{ "text": string, "confidence":
number }`, max 3, commit 24 only. Commit 22 may send `[]`.
A `final` with empty `text` is treated as `cancel` /
`reason = "user"`. The add-in puts `text` into the same
command input a typed sentence would use. It does not send
`final.text` anywhere the typed box would not go.

### `error` (either direction)

```json
{
  "v": 1, "type": "error", "session_id": "uuid",
  "utterance_id": "uuid-or-null", "seq": 3,
  "ts": "...", "token": "<session_token-or-empty>",
  "code": "mic_denied",
  "message": "Microphone permission denied.",
  "fatal": false
}
```

`code` values: `mic_denied`, `stt_failed`, `token_expired`,
`token_scope`, `seq_gap`, `unknown_type`, `orphan_release`,
`duplicate_companion`, `protocol`, `peer_closed`,
`document_rejected`, `write_rejected`.
`fatal: true` closes the socket after the frame.

### `heartbeat` (either direction)

```json
{
  "v": 1, "type": "heartbeat", "session_id": "uuid",
  "utterance_id": null, "seq": 10,
  "ts": "...", "token": "<session_token>",
  "ok": true
}
```

Every `heartbeat_s` (default 5). If the add-in misses three
in a row, treat as `peer_closed`.

### `token_rotate` / `revoked` (add-in → companion)

```json
{
  "v": 1, "type": "token_rotate", "session_id": "uuid",
  "utterance_id": null, "seq": 11,
  "ts": "...", "token": "<current session_token>",
  "next_session_token": "opaque",
  "expires_at": "..."
}
```

```json
{
  "v": 1, "type": "revoked", "session_id": "uuid",
  "utterance_id": null, "seq": 12,
  "ts": "...", "token": "<session_token>",
  "reason": "user_logout"
}
```

## State machine

Companion-side states for one connection. Overlay states
`listening` / `live_transcript` match plan 1091–1096.

```
unpaired
  -- hello (valid pairing_token) --> idle
  -- hello (bad/expired token)    --> unpaired  + error.token_expired fatal
  -- any other type               --> unpaired  + error.protocol

idle
  -- press                        --> listening   (new utterance_id)
  -- heartbeat                    --> idle
  -- token_rotate                 --> idle        (swap token)
  -- revoked / socket close       --> unpaired
  -- second hello                 --> idle        + error.protocol (ignore)
  -- release / cancel / partial / final
                                  --> idle        + error.orphan_release
                                                  or ignore

listening                         (mic open, no partial yet)
  -- partial                      --> live_transcript
  -- release                      --> release_received
  -- cancel                       --> idle        (wipe audio)
  -- error.mic_denied             --> idle
  -- heartbeat                    --> listening
  -- peer_closed / process death  --> (see failures)
  -- second press, same utterance --> listening   (ignore)
  -- second press, new utterance  --> listening   (cancel old, reason=superseded)

live_transcript
  -- partial                      --> live_transcript
  -- release                      --> release_received
  -- cancel                       --> idle
  -- peer_closed                  --> (see failures)

release_received                  (waiting to emit final)
  -- final                        --> idle        (add-in takes the text)
  -- cancel                       --> idle
  -- timeout 2 s with no final    --> idle        + error.stt_failed
  -- press                        --> listening   (cancel prior, reason=superseded)
```

Add-in pane states after a good `final` are plan 1096–1103
(`release_received` → confirmation window → `resolving`).
They are not companion states. The companion is done at
`final`.

### Failure transitions

| Failure | Companion | Add-in | Command opened? |
|---|---|---|---|
| Companion dies mid-utterance (process exit while `listening` or `live_transcript`) | OS closes the socket; audio buffer is process-lifetime and dies with it | Three missed heartbeats or `peer_closed` → treat as `cancel` / `reason=disconnect`. Overlay cleared. Selection snapshot kept but unused | No |
| Bridge disconnects after `press` and before `release` | Same as death if the process is gone. If the process lives, it sends `cancel` / `reason=disconnect` on reconnect before any new `press` | Unfinished `utterance_id` is cancelled. A later `release` for that id is `orphan_release` | No |
| Token expires mid-session | Next outbound frame is rejected; companion emits `error.token_expired` `fatal=true`, wipes audio, returns to `unpaired` | Discard partials; banner “Companion session expired. Type the command instead.” Re-pair required | No |
| Two companions racing | First `hello` that redeems the single-use `pairing_token` wins. Second `hello` with the same token → `error.duplicate_companion` `fatal=true`. A second process that connects without a token never leaves `unpaired` | Ignore frames whose `companion_id` is not the winner. Overlay names the paired companion only | Only the winner’s `final` |
| `mic_denied` | `error.mic_denied` `fatal=false`; state `idle` | Banner “Microphone permission denied.” Typed fallback | No |
| `seq_gap` | — | `error.seq_gap`; cancel current utterance; do not apply a late `final` | No |
| Companion sends a document field (`paragraphs`, `blocks`, `old_text`, `new_text`, `ooxml`, `action`) | — | Drop the frame. `error.document_rejected` `fatal=true`. Revoke the session | No |
| Companion sends a write directive (`insertText`, `track`, `comment`, `apply`) | — | Drop the frame. `error.write_rejected` `fatal=true`. Revoke the session | No |

Idempotency: `press` / `release` / `final` / `cancel` for a
given `utterance_id` are applied once. Duplicates are acked
silently.

## Audio and transcript retention

Defaults implement plan 1436 (“Storing raw audio by default”
is deferred), plan 580 (“No audio BLOB column”), and risk
1450.

| Item | Default | Rationale |
|---|---|---|
| Raw audio on companion | In-memory ring buffer only. Wiped on `release`, `cancel`, `error`, token expiry, process exit. Never written to disk | Privileged speech must not become a file the OS indexes |
| Raw audio on add-in / server | Never accepted. A frame containing `audio`, `wav`, `pcm`, or a binary WS message is `error.protocol` `fatal=true` | The bridge carries “event metadata and transcript text only” (plan 888) |
| Partial transcript | Companion and add-in hold it only while `live_transcript`. Discarded on cancel/expiry. Not POSTed to the server | Partials are UX, not evidence |
| Final transcript on add-in | Held for the confirmation window (plan 1096, commit 24). User may edit. On send, the **confirmed** string becomes Contextual Command `raw` text, same as typing | Voice is an input peripheral, not a second agent (plan 134–149) |
| Final transcript on server | Off by default. Migration 0005 may store raw transcript only behind an explicit, auditable setting. Default store is the confirmed command text, not the STT string | Risk 1450: spoken privileged instructions in logs/prompts |
| Telemetry | Event types, durations, error codes, `confidence` bucketed to `{low,mid,high}`. No `text` | Redacted telemetry (plan 1450) |

## Negative capabilities

These three are load-bearing security boundaries (plan 142–148,
1434, 1451). Each is a MUST NOT.

### The bridge receives no document text

MUST NOT accept `paragraphs`, `blocks`, `selection.text`,
`old_text`, `ooxml`, `doc_hash` contents, issue bodies, or
any field whose purpose is document content. The schema
above has no such fields; a frame that adds them is
`document_rejected`.

If violated: a compromised companion (risk 1451) becomes a
document exfiltration path. Local STT then sees the
agreement, and the “narrow input peripheral” claim is
false.

### The bridge has no Word write authority

MUST NOT carry apply/prepare/confirm actions, tracked-change
payloads, or comment bodies destined for Word. Writes stay
on the add-in path: prepare → human approval →
`apply.js` / current `act("track"|"comment")` (plan 873–877,
`taskpane.js` 734–783).

If violated: the companion can mutate the deed without the
approval gate and without tracked-change verification.

### The bridge performs no direct Word COM automation

MUST NOT call Word COM, VBA, or `Word.Application` from the
companion. Plan 1434 lists this as avoid/defer. All Word
I/O stays in Office.js inside the add-in.

If violated: the companion bypasses capability negotiation,
version hashes, and the suppressed-check banner (artefact
4). It also breaks Mac/Online and the signed-add-in trust
boundary.

## Fake-companion minimum (commit 22)

A process that:

1. Listens on `ws://127.0.0.1:$AGMT_BRIDGE_PORT/v1`
   (default 17321).
2. Accepts `hello` when `token == $AGMT_PAIRING_TOKEN`.
3. Replies `hello_ok` with `signed: false`.
4. On stdin lines `press`, `partial <text>`, `release`,
   `final <text>`, `cancel`, `error <code>`, emits the
   corresponding frame with incrementing `seq` and a
   single `utterance_id` per `press`. A complete utterance
   is `press` → zero or more `partial` → `release` →
   `final`. Emit `release` before `final`; the state
   machine only accepts `final` from `release_received`.
5. Sends `heartbeat` every 5 s.
6. Rejects any JSON object that contains a key in
   `{paragraphs, blocks, old_text, new_text, ooxml, audio,
   action, insertText}`.

No speech engine. No COM. The add-in must treat
`final.text` as if it had been typed.
