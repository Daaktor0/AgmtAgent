"""The supervisor loop.

A strong model holds the mandate and drives the workflow in Section 5 of the
skill. It is not a pipeline: the model chooses what to read, what to search,
what to delegate and when it has enough. Deterministic tools give it exact
facts; worker models give it breadth; it owns the conclusion.
"""
from __future__ import annotations

import json
from typing import Iterator

from .config import Config, load_skill
from .document import Document
from .router import Router, RouterError
from .tools import TOOL_SCHEMAS, Toolbox

MODES: dict[str, dict[str, str]] = {
    "A": {"name": "Full agreement review", "brief":
          "Work through Steps 1-8 of Section 5. Build the deal map, read definitions with "
          "the provisions they operate in, run the mechanical checks, and check overlap "
          "before proposing any protection. Show prioritised, actionable issues only — "
          "clause/issue, consequence, recommended position, drafting or comment where it "
          "helps. Do not flood the user with stylistic edits."},
    "B": {"name": "Clause review", "brief":
          "Answer the decision first: accept / revise / delete / clarify / commercial call. "
          "Then the actual consequence, then the minimum change if one is needed, then a "
          "counterparty comment only if one is useful. Still check the rest of the document "
          "for overlap before you propose anything."},
    "C": {"name": "Drafting / redrafting", "brief":
          "Draft from the existing clause. Preserve its architecture. Introduce no new "
          "concepts, representations, wider obligations, liability standards or procedural "
          "requirements unless the instruction requires it. If the user asked only for "
          "drafting, record the issue with new_text and keep consequence to one line."},
    "D": {"name": "Surgical inline amendment", "brief":
          "Identify the exact defective words. Retain everything unaffected. Delete only "
          "what causes the problem and add the narrowest necessary language. Every "
          "record_issue must carry old_text copied verbatim and under 200 characters, plus "
          "new_text. Check resulting grammar and defined terms, then list consequential "
          "amendments elsewhere."},
    "E": {"name": "Bubble comments", "brief":
          "Produce external negotiation language, not internal analysis. Concise, neutral, "
          "document-linked, send-ready — usually one short paragraph. Say what the revised "
          "drafting now does, that the relevant protection remains, any material carve-out, "
          "and that related deletions are consequential. Do not write a comment merely "
          "because a clause was revised."},
    "F": {"name": "Counterparty markup review", "brief":
          "For each material change: what changed legally, what changed economically, "
          "whether it merely clarifies, whether it creates a new obligation, removes a "
          "protection, duplicates another provision, or sets a precedent. Use position "
          "accept / accept_with_drafting_fix / negotiate / reject / "
          "factual_confirmation_needed, and distinguish points to preserve from tradable "
          "points in the consequence field."},
    "G": {"name": "Negotiation strategy", "brief":
          "Internal voice, candid. For each issue give actual risk, legal baseline, our "
          "preferred position, the counterparty's likely rationale, minimum acceptable "
          "fallback, and whether the point is drafting-only or needs a commercial "
          "instruction. Do not pretend a preferred position is market."},
    "H": {"name": "Negotiation call prep", "brief":
          "Spoken format. Headline, mechanic, consequence, ask or fallback. Get to the "
          "answer immediately; no doctrine first. For transfer mechanics explain what "
          "contractually happens before why parties negotiate it. Use 'validly exercised' "
          "where it matters and avoid unsupported absolutes."},
    "I": {"name": "Interpretation / explanation", "brief":
          "Result, then the contractual hook, then the practical consequence. Three "
          "sentences may be enough. Distinguish likely interpretation, drafting-dependent "
          "outcome, negotiated commercial effect and mandatory legal requirement. Put the "
          "explanation in finish(); record issues only where something is actually wrong."},
    "J": {"name": "Consistency / cross-reference check", "brief":
          "Start with run_mechanical_checks and treat its output as ground truth — verify "
          "each finding by reading the paragraph before recording it. Then check what the "
          "mechanical layer cannot: whether cross-references point at the right provision, "
          "whether thresholds and timelines agree across clauses and schedules, and whether "
          "party names and capacities are consistent."},
    "K": {"name": "Proofreading", "brief":
          "Review the whole document. Distinguish substantive error, drafting "
          "inconsistency, grammatical issue and formatting/execution issue in the "
          "classification and consequence. Do not silently rewrite prose for style."},
    "L": {"name": "Comparison of versions", "brief":
          "Do not report textual differences. For each meaningful change say what changed, "
          "whether legal effect changed, whether protection increased or decreased, whether "
          "it resolves an earlier issue, whether it creates a new inconsistency, and whether "
          "anything previously agreed has disappeared."},
    "M": {"name": "Email summarising changes", "brief":
          "Communicate positions, not the markup. Prioritise material negotiated changes, "
          "use precise clause-linked descriptions, and leave out minor clean-up. Put the "
          "email itself in finish()."},
    "N": {"name": "Near-final / pre-signing QC", "brief":
          "Minimise substantive rewriting. Run run_mechanical_checks first and verify every "
          "finding against the text. Then work the Section 6 Mode N list exhaustively: "
          "defined terms, cross-references, parties and capacities, dates and amounts, "
          "schedules and annexures, disclosure mappings, signature blocks, execution "
          "mechanics, unresolved comments and placeholders, duplicated or missing "
          "provisions, and amendments made in one provision but not carried through. "
          "Record minor issues too — execution-stage defects matter."},
}

OPERATING = """
--- HOW YOU OPERATE HERE ---

You are the supervising partner on this document. You work through tools; you cannot
see the document except through them.

Ground rules:

1. Paragraph indices in square brackets are the document's coordinate system. Every
   issue you record must carry the paragraph index you actually read it at. Never
   guess an index.
2. Quote existing wording verbatim. `old_text` is searched for character-for-character
   in Word — if it does not match exactly, the user cannot accept your edit. Keep it
   under 200 characters. If the change cannot be expressed that surgically, that is
   usually a signal the change is too large.
3. `run_mechanical_checks` is exact and cannot hallucinate, but it is blind to meaning.
   Verify a finding by reading the paragraph before you record it, and discard the ones
   that are not real.
4. Before proposing any protection, run `search_document` for where the same risk is
   already addressed. Record the overlap you found in your reasoning. Adding a second
   remedy for one wrong is a failure, not thoroughness.
5. `delegate` gives you breadth over long schedules and warranty sets. The worker sees
   only the slice you give it and cannot check the rest of the document. Verify anything
   it asserts that you intend to act on.
6. Record issues as you settle them, not in a batch at the end. If a review is cut
   short, what you have recorded is what the user gets.
7. Call `finish` when further reading would not change your advice — not when you have
   run out of clauses. Lead with the two or three things that actually matter.
8. If the mandate is unclear on something that changes the analysis — which party you
   act for above all — call `ask_user`, then proceed on the most defensible assumption
   and say which one you took.

You have a budget of roughly {steps} tool calls. Spend them where the risk is.
"""


def build_system_prompt(mode: str, mandate: dict, steps: int) -> str:
    m = MODES.get(mode.upper(), MODES["A"])
    parts = [
        load_skill(),
        OPERATING.format(steps=steps),
        f"--- MODE {mode.upper()}: {m['name']} ---\n{m['brief']}",
        "--- MANDATE ---\n" + json.dumps(
            {k: v for k, v in mandate.items() if v}, indent=2),
    ]
    return "\n\n".join(parts)


class Supervisor:
    def __init__(self, cfg: Config, router: Router):
        self.cfg = cfg
        self.router = router

    def run(self, paragraphs: list[str], mode: str, mandate: dict,
            instruction: str = "", prefixes: list[str] | None = None) -> Iterator[dict]:
        doc = Document(paragraphs, prefixes=prefixes)
        box = Toolbox(doc, self.router, mandate)

        yield {"event": "parsed", "clauses": len(doc.clauses),
               "definitions": len(doc.definitions), "paragraphs": len(doc.paras)}

        try:
            model = self.router.resolve("supervisor")
        except RouterError as exc:
            yield {"event": "error", "message": str(exc)}
            return
        yield {"event": "model", "role": "supervisor", "model": model}

        opening = instruction.strip() or (
            f"Run mode {mode.upper()} on this document.")
        messages = [
            {"role": "system", "content": build_system_prompt(
                mode, mandate, self.cfg.max_supervisor_steps)},
            {"role": "user", "content":
                f"{opening}\n\nThe document has {len(doc.paras)} paragraphs and "
                f"{len(doc.clauses)} numbered provisions. Start with get_outline."},
        ]

        for step in range(self.cfg.max_supervisor_steps):
            try:
                resp = self.router.chat("supervisor", messages,
                                        tools=TOOL_SCHEMAS, model=model)
            except RouterError as exc:
                yield {"event": "error", "message": str(exc)}
                return

            msg = resp["choices"][0]["message"]
            messages.append(msg)

            if msg.get("content"):
                yield {"event": "thinking", "text": msg["content"][:2000]}

            calls = msg.get("tool_calls") or []
            if not calls:
                # No tool call and no finish — treat the prose as the answer.
                box.finished = box.finished or msg.get("content", "")
                break

            for call in calls:
                name = call["function"]["name"]
                try:
                    args = json.loads(call["function"].get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                yield {"event": "tool", "name": name,
                       "args": {k: v for k, v in args.items()
                                if k in ("ref", "term", "query", "start", "end",
                                         "title", "role", "question")}}
                result = box.call(name, args)
                messages.append({"role": "tool", "tool_call_id": call["id"],
                                 "content": result})
                if name == "record_issue" and box.issues:
                    yield {"event": "issue", "issue": box.issues[-1]}
                if name == "ask_user" and box.questions:
                    yield {"event": "question", "question": box.questions[-1]}

            if box.finished is not None:
                break

        yield {
            "event": "done",
            "summary": box.finished or "Review ended without a summary.",
            "issues": box.issues,
            "questions": box.questions,
            "mechanical": [
                {"check": i.check, "severity": i.severity, "para": i.para,
                 "ref": i.ref, "detail": i.detail, "excerpt": i.excerpt}
                for i in doc.mechanical_checks()
            ],
        }
