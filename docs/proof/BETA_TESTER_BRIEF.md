# Agmt Proof — supervised tester brief

Freeze: `proof-local-supervised-2026-09-11`. Public page: https://app.agmt.legal/proof. Access is not technically restricted.

Proof is not a comprehensive proofreader, grammar checker or legal review. It does not claim perfect accuracy. It does not use a language model. Your document is processed on this device and is not sent to Agmt.

Start with a synthetic or non-confidential `.docx`. Review the download in Microsoft Word.

## What to do

1. Open https://app.agmt.legal/proof in a current desktop Chromium browser (Chrome, Edge, or another up-to-date Chromium build). An account is not required.
2. Choose a native unencrypted `.docx` that you are allowed to use. Prefer a synthetic or non-confidential document for this cohort.
3. Wait for processing, then download the marked copy.
4. Open the download in Microsoft Word. Turn on **All Markup**.
5. Accept or reject Agmt Proof tracked changes. Read the comments. Existing comments and revisions should remain.
6. Header tracked changes live in the header story. Turn on the header, then use Accept/Reject there. Document-level revision counts in Word may omit header stories.

## Supported browsers and documents

- Desktop Chromium. Firefox, Safari and iOS are untested in this freeze.
- Native unencrypted Word `.docx`. Not `.doc`, `.docm`, `.dotx`, PDF, Strict OOXML, macros, encryption or IRM.
- Published size limit: see the on-page note. A smaller file can still be refused if its Word XML or extracted text is too complex.
- Do not treat a 100 MiB Word file as in scope.

## What Proof checks

- Ordinary English spelling in prose, as Word comments, using a UK or US dictionary. Repeated misspellings are still detected; repeated comments are combined onto the first exact span.
- A small frozen list of high-confidence typos, as tracked changes.
- Repeated ordinary function words such as “the the”.
- Repeated punctuation, extra ordinary-prose spaces, a space before a comma or full stop, and a missing space after punctuation, as tracked changes when the span is exact.
- Unmatched brackets or quotation marks, as comments, after looking at neighbouring paragraphs. Proof does not insert a missing mark merely because one paragraph is incomplete.
- Unfinished placeholders such as `[●]` or `[TBD]`.
- Duplicate or inconsistent definitions, defined-term capitalisation, missing or ambiguous internal references, duplicate clause numbers, party-name consistency, invalid calendar dates, and bound words-and-figures mismatches, when the document’s indexes are complete.
- Title-case phrases after “the/this/such” with no matching definition are **review questions**, not confirmed errors. Title case alone does not prove a term is undefined. A term inherited from another named agreement is not flagged merely because this file omits the definition.
- A citation with no matching clause or schedule in the checked text is a **qualified review point**, not a proven drafting error, unless other clauses or schedule headings are present and this one is not. A reference may legitimately point outside the document.
- Headers: tracked typo and punctuation corrections only.

## Material exclusions

- Grammar, style and legal meaning. Do not treat an unmarked sentence as approved English. Classify any concern using the full sentence, not a short phrase taken out of context.
- Quoted defined names and short quoted examples.
- Title-case name runs without a close dictionary suggestion.
- Text inside existing tracked changes (not relocated).
- Comments in headers. Footers, footnotes and endnotes are preserved and not checked. Fields, text boxes and modern review markup.
- Macros, encryption, IRM, Strict OOXML, `.doc`, `.docm`, `.dotx` and PDF.

A result that says checks found nothing to mark does not mean the document is error-free. Limited coverage is not a clean result.

## How to report a problem

Category only: https://app.agmt.legal/proof/feedback

Use that form to record:

- an incorrect finding;
- a missed error;
- a formatting or download problem.

The form stores only the category, an optional closed reason, and (if you tick the box) app version and browser. It does not collect written notes, filenames, excerpts or documents. Send is explicit: nothing is recorded until you press **Send category**.

Written observations should go to the person who invited you, through the same channel as the invitation. Do not paste confidential clauses.

Workers observability retains the structured category events for up to 7 days, sampled at 100% on the current Worker. They are not a support mailbox.

## Original live example

The first live failure document has not been reproduced. If you still have that small Word file or the exact planted sentences, send a non-confidential copy through the contact you were given when invited — not through the category form. Substitute fixtures used in development are not that document.
