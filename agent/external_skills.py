"""External skill loading: curated LegalQuants lq-skills playbooks.

Agmt's own AGREEMENT-SKILL.md stays the authoritative system prompt. This
module adds *supplementary* per-document-type playbooks from the open-source
LegalQuants/lq-skills library (Apache-2.0) so an NDA is reviewed with NDA
depth, an SaaS MSA with SaaS depth, etc.

Design:
- document type detection runs locally (regex on the text, no model call);
- skills are fetched once from GitHub raw and cached in data/skills/;
- the cache never auto-refreshes mid-session; a TTL re-fetch happens on
  server start only;
- the loaded playbook is appended to the system prompt as a clearly-labelled
  SUPPLEMENTARY section — the core skill's rules (verbatim anchors,
  click-to-apply, no fabrication) always win on conflict;
- network failures degrade silently to core-skill-only review.

Licence note: lq-skills is Apache-2.0. Notices are maintained in
THIRD_PARTY_NOTICES.md.
"""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data" / "skills"
CACHE_TTL = 24 * 3600  # re-fetch daily at most
RAW_BASE = ("https://raw.githubusercontent.com/LegalQuants/lq-skills/"
            "main/skills/{name}/SKILL.md")

# Local document-type detection -> LQ skill names worth loading.
# Ordered: first match wins for primary playbook; extras load as context.
DETECTORS: list[dict[str, Any]] = [
    {"doc_type": "nda",
     "patterns": [r"\bnon[- ]disclosure\b", r"\bunilateral\b.*\bdisclosure\b",
                  r"\bconfidential information\b", r"\bdisclosing party\b",
                  r"\breceiving party\b"],
     "threshold": 2,
     "primary": "nda-review",
     "extras": []},
    {"doc_type": "saas_msa",
     "patterns": [r"\bsoftware as a service\b", r"\bSaaS\b",
                  r"\bsubscription (services|agreement)\b",
                  r"\bcloud services agreement\b"],
     "threshold": 1,
     "primary": "msa-review-saas",
     "extras": ["contract-qa"]},
    {"doc_type": "purchase_msa",
     "patterns": [r"\bmaster (purchase|supply) agreement\b",
                  r"\bpurchase order\b", r"\bgoods and/or services\b"],
     "threshold": 1,
     "primary": "msa-review-commercial-purchase",
     "extras": []},
    {"doc_type": "dpa",
     "patterns": [r"\bdata processing (agreement|addendum)\b",
                  r"\bpersonal data\b", r"\bGDPR\b", r"\bprocessor\b.*\bcontroller\b",
                  r"\bbusiness associate\b"],
     "threshold": 2,
     "primary": "dpa-checklist-review",
     "extras": []},
]


def detect_document_type(text: str) -> dict | None:
    """Return the first matching detector, or None."""
    sample = text[:200_000]  # head of the document is enough
    for det in DETECTORS:
        hits = sum(1 for p in det["patterns"]
                   if re.search(p, sample, re.IGNORECASE))
        if hits >= det["threshold"]:
            return det
    return None


def _cache_path(name: str) -> Path:
    return CACHE_DIR / f"{name}.md"


def fetch_skill(name: str, *, timeout: float = 8.0,
                force: bool = False) -> str | None:
    """Fetch one LQ skill body (frontmatter stripped). Cached on disk."""
    cp = _cache_path(name)
    if not force and cp.exists():
        age = time.time() - cp.stat().st_mtime
        if age < CACHE_TTL:
            try:
                return cp.read_text(encoding="utf-8")
            except OSError:
                pass
    try:
        import urllib.request
        url = RAW_BASE.format(name=name)
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            body = resp.read().decode("utf-8", errors="replace")
    except Exception:
        # Offline / blocked: fall back to any cached copy regardless of age.
        if cp.exists():
            try:
                return cp.read_text(encoding="utf-8")
            except OSError:
                return None
        return None
    # Strip YAML frontmatter; keep the playbook prose.
    body = re.sub(r"^---\n.*?\n---\n", "", body, count=1, flags=re.S)
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cp.write_text(body, encoding="utf-8")
    except OSError:
        pass
    return body


def _trim(body: str | None, max_chars: int = 12_000) -> str:
    """Keep the playbook within a prompt-safe budget."""
    if not body:
        return ""
    if len(body) <= max_chars:
        return body
    cut = body[:max_chars]
    last_break = cut.rfind("\n## ")
    return cut[:last_break] if last_break > max_chars // 2 else cut


def load_supplementary_skills(text: str, *,
                              fetcher=None) -> list[dict[str, str]]:
    """Detect document type and load matching LQ playbooks.

    Returns a list of {"name", "body"} dicts (possibly empty). Never raises:
    a review must proceed with the core skill alone when anything fails."""
    get = fetcher or fetch_skill
    det = detect_document_type(text)
    if not det:
        return []
    out = []
    seen: set[str] = set()
    for name in [det["primary"], *det["extras"]]:
        if name in seen:
            continue
        seen.add(name)
        body = _trim(get(name))
        if body:
            out.append({"name": name, "body": body})
    return out


def supplementary_prompt_block(skills: list[dict[str, str]]) -> str:
    """Render loaded playbooks as a clearly subordinate prompt section."""
    if not skills:
        return ""
    parts = [
        "\n\n# SUPPLEMENTARY PLAYBOOKS (reference material — subordinate "
        "to every rule above)\n",
        "The following community-reviewed playbooks match this document's "
        "type. Use them as checklists for substance you might otherwise "
        "miss. Where they conflict with your core instructions — verbatim "
        "quotation, click-to-apply, no fabricated wording, smallest "
        "defensible intervention — YOUR CORE INSTRUCTIONS WIN.",
    ]
    for sk in skills:
        parts.append(f"\n\n## Playbook: {sk['name']}\n\n{sk['body']}")
    return "".join(parts)
