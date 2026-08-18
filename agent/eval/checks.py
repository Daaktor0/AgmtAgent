"""Deterministic mechanical-check harness. No network, no model."""
from __future__ import annotations

from pathlib import Path

from ..document import Document
from .corpus import load_corpus
from .harness import normalize_issue
from .metrics import match_label


def run_checks(corpus_dir: Path) -> int:
    try:
        docs = load_corpus(Path(corpus_dir))
    except (OSError, ValueError, KeyError) as exc:
        print(f"failed to load corpus: {exc}")
        return 1

    total_found = 0
    total_must = 0
    total_missed = 0
    total_traps = 0
    ok = True

    for doc in docs:
        parsed = Document(doc.paragraphs, prefixes=doc.prefixes)
        issues = [normalize_issue(i) for i in parsed.mechanical_checks()]

        must = [lab for lab in doc.labels if lab.get("must_find")]
        traps = [lab for lab in doc.labels if lab.get("must_not_flag")]

        hit, missed, fired = [], [], []
        for lab in must:
            total_must += 1
            check = lab.get("check")
            if any(match_label(issue, lab) for issue in issues):
                hit.append(check)
                total_found += 1
            else:
                missed.append(lab.get("id", check))
                total_missed += 1
                ok = False
        for lab in traps:
            if any(match_label(issue, lab) for issue in issues):
                fired.append(lab.get("id", lab.get("check")))
                total_traps += 1
                ok = False

        print(f"{doc.doc_id}: found {len(hit)}/{len(must)} must-finds, "
              f"missed {len(missed)}, trap fires {len(fired)}")
        if hit:
            print(f"  found: {', '.join(hit)}")
        if missed:
            print(f"  missed: {', '.join(str(m) for m in missed)}")
        if fired:
            print(f"  trap fires: {', '.join(str(t) for t in fired)}")

    print(f"\noverall: found {total_found}/{total_must} must-finds, "
          f"missed {total_missed}, trap fires {total_traps}")
    return 0 if ok else 1
