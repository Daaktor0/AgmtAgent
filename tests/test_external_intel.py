"""Tests for external skill loading (LQ lq-skills) and the pre-ingest
security scan (noroboto-derived).

No network: fetchers are injected stubs.

Run as a script: PASS/FAIL lines, ends ALL PASSED.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("AGMT_DB", tempfile.mktemp(prefix="agmt-ext-"))

from agent.document_scan import scan_paragraphs, sanitize  # noqa: E402
from agent.external_skills import (  # noqa: E402
    detect_document_type, load_supplementary_skills, supplementary_prompt_block,
)

FAILS: list[str] = []


def check(name: str, cond: bool) -> None:
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


NDA_TEXT = """
MUTUAL NON-DISCLOSURE AGREEMENT

The Disclosing Party and the Receiving Party wish to explore a business
relationship. Confidential Information shall be protected.
"""

SAAS_TEXT = """
SAAS SUBSCRIPTION AGREEMENT

This Software as a Service Agreement governs access to the platform.
"""

STUB_PLAYBOOKS = {
    "nda-review": "# NDA Review Playbook\n\nCheck term, carveouts, residuals.",
    "contract-qa": "# Contract QA\n\nAnswer questions against the document.",
}


def fake_fetcher(name: str):
    return STUB_PLAYBOOKS.get(name)


def main() -> None:
    print("\ndocument type detection")
    det = detect_document_type(NDA_TEXT)
    check("NDA detected", det is not None and det["doc_type"] == "nda")
    det2 = detect_document_type(SAAS_TEXT)
    check("SaaS MSA detected", det2 is not None and det2["doc_type"] == "saas_msa")
    check("generic text matches nothing",
          detect_document_type("The quick brown fox jumps.") is None)

    print("\nskill loading")
    loaded = load_supplementary_skills(NDA_TEXT, fetcher=fake_fetcher)
    names = [s["name"] for s in loaded]
    check("primary playbook loaded", "nda-review" in names)
    check("body is frontmatter-stripped prose",
          all(not s["body"].startswith("---") for s in loaded))
    empty = load_supplementary_skills(
        "Nothing relevant here at all.", fetcher=fake_fetcher)
    check("unmatched documents load nothing", empty == [])
    offline = load_supplementary_skills(
        NDA_TEXT, fetcher=lambda n: None)
    check("fetch failure degrades to no playbooks", offline == [])
    block = supplementary_prompt_block(loaded)
    check("prompt block marks itself subordinate",
          "CORE INSTRUCTIONS WIN" in block and "SUPPLEMENTARY" in block)
    check("no playbooks -> no prompt block",
          supplementary_prompt_block([]) == "")

    print("\ninjection scan")
    clean = scan_paragraphs(["Plain contract language. Nothing hidden."])
    check("clean document passes", clean.clean and clean.risk == "none")

    bidi = scan_paragraphs(["Invoice total: 100\u202e005$"])
    check("bidi override detected as high risk",
          bidi.risk == "high"
          and any(f.kind == "bidi" for f in bidi.findings))

    zw = scan_paragraphs(["hidden\u200binstructions\u200bhere"])
    check("zero-width characters detected",
          any(f.kind == "zero_width" for f in zw.findings) and zw.risk == "low")

    pua = scan_paragraphs(["\ue000\ue001 private use glyphs"])
    check("private-use-area detected as high risk",
          any(f.kind == "pua" for f in pua.findings))

    mixed = scan_paragraphs(["The раrу named here uses Cyrillic а letters"])
    check("mixed-script word flagged",
          any(f.kind == "homoglyph_cluster" for f in mixed.findings))

    dirty = "safe\u200btext with\u202ebidi"
    cleaned = sanitize(dirty)
    check("sanitize strips invisibles only",
          cleaned == "safetext withbidi")

    counts = sum(f.count for f in scan_paragraphs(
        [dirty, dirty]).findings if f.kind != "homoglyph_cluster")
    check("counts aggregate across paragraphs", counts >= 4)

    if FAILS:
        print(f"\nFAILED ({len(FAILS)}): " + ", ".join(FAILS))
        sys.exit(1)
    print("\nALL PASSED")


if __name__ == "__main__":
    main()
