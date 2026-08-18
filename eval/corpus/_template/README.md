# Deal intake — redlines and labels

Copy this folder for each deal. Name the copy with a short id (`ssa-aurora-2026`, `sha-kestrel-r2`). Fill the two YAML files. Put the Word files in `documents/`.

This is **eval gold**, not training data. Nothing here is used to fine-tune a model. It scores whether the reviewer found what a lawyer would have found, and whether it stayed silent on traps.

Send 3–5 deals to start. 8–15 is a working corpus. Prefer Indian / cross-border venture and PE paper (SSA, SHA, SPA, disclosure letter, side letter). Include at least one deal you consider clean.

---

## What to put in `documents/`

| File | Required | Notes |
|---|---|---|
| Current working draft (`.docx`) | **Yes** | The text the agent should review. Clean of your own working notes if you can. |
| Redline / comparison vs the previous mark-up | If you have it | Word compare, or the counterpart's tracked-changes file. Used later for Mode F. Not scored this week. |
| Prior round (the "before") | If you have a redline | So the comparison has both sides. |
| Disclosure letter / side letter / SHA if this is an SSA (and vice versa) | If they belong to the same signing set | Cross-document labels go in the same deal folder. Say which file is primary. |

Do **not** send: privilege logs, advice emails, or anything you would not put in a data room. Redact party names only if you must — if you do, say so in `mandate.yaml` so labels still match the redacted text.

---

## How to fill the YAML

1. `mandate.yaml` — who you acted for, what the document is, what "good" means on this run.
2. `labels.yaml` — 5–15 **must-find** defects and 3–5 **traps**.

A **must-find** is something a competent reviewer on your side would be embarrassed to miss. A **trap** looks wrong and is commercially intended — flagging it is a false positive.

Write labels in your own words. Clause numbers help. Exact `check:` ids are optional (see the labels file). If you cannot remember a clause number, quote six to twelve words of the offending sentence.

---

## Minimum viable deal

If you are short on time, one current `.docx` + `mandate.yaml` with party / stage / document type + five must-finds and three traps in `labels.yaml` is enough to ingest.
