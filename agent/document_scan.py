"""Pre-ingest document scan for hidden / obfuscated content.

Adapted from concepts in LegalQuants' `noroboto` (MIT): DOCX/PDF documents can
carry invisible Unicode — zero-width joiners, bidi overrides, homoglyphs,
private-use-area glyphs — that humans never see but models read as
instructions. A review tool that feeds raw text to a model must detect this
*before* the model sees it (plan lesson: "treat documents as untrusted data").

This is a detection layer, not a sanitizer: findings are surfaced to the
lawyer and attached to the run; the original text still flows through, with
invisible characters stripped at ingestion so they cannot steer the model.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Invisible / dangerous ranges and characters.
_ZERO_WIDTHS = {
    "\u200b": "zero-width space",
    "\u200c": "zero-width non-joiner",
    "\u200d": "zero-width joiner",
    "\u2060": "word joiner",
    "\ufeff": "byte-order mark (zero-width no-break space)",
}
_BIDI = {
    "\u202a": "left-to-right embedding",
    "\u202b": "right-to-left embedding",
    "\u202c": "pop directional formatting",
    "\u202d": "left-to-right override",
    "\u202e": "right-to-left override",  # classic visual spoofing attack
    "\u2066": "left-to-right isolate",
    "\u2067": "right-to-left isolate",
    "\u2068": "first strong isolate",
    "\u2069": "pop directional isolate",
}
_SUSPICIOUS_CONTROLS = {
    "\u00ad": "soft hyphen",
}


@dataclass
class ScanFinding:
    kind: str          # zero_width | bidi | control | homoglyph_cluster | pua
    char: str
    codepoint: str
    label: str
    count: int
    first_para: int    # 0-based paragraph index of first occurrence


@dataclass
class ScanReport:
    findings: list[ScanFinding] = field(default_factory=list)
    paragraphs_scanned: int = 0

    @property
    def clean(self) -> bool:
        return not self.findings

    @property
    def risk(self) -> str:
        """none | low | high. Bidi overrides and PUA are high; the rest low."""
        if any(f.kind in {"bidi", "pua"} for f in self.findings):
            return "high"
        if self.findings:
            return "low"
        return "none"

    def summary(self) -> dict:
        return {
            "clean": self.clean,
            "risk": self.risk,
            "paragraphs_scanned": self.paragraphs_scanned,
            "findings": [
                {"kind": f.kind, "codepoint": f.codepoint,
                 "label": f.label, "count": f.count,
                 "first_para": f.first_para}
                for f in self.findings
            ],
        }


def scan_paragraphs(paragraphs: list[str]) -> ScanReport:
    report = ScanReport(paragraphs_scanned=len(paragraphs))
    counters: dict[tuple[str, str], list] = {}

    def note(kind: str, ch: str, label: str, para_idx: int) -> None:
        key = (kind, f"U+{ord(ch):04X}")
        if key not in counters:
            counters[key] = [kind, ch, f"U+{ord(ch):04X}", label, 0, para_idx]
        counters[key][4] += 1

    for idx, text in enumerate(paragraphs):
        for ch in text:
            if ch in _ZERO_WIDTHS:
                note("zero_width", ch, _ZERO_WIDTHS[ch], idx)
            elif ch in _BIDI:
                note("bidi", ch, _BIDI[ch], idx)
            elif ch in _SUSPICIOUS_CONTROLS:
                note("control", ch, _SUSPICIOUS_CONTROLS[ch], idx)
            elif 0xE000 <= ord(ch) <= 0xF8FF:
                note("pua", ch, "private use area", idx)
            elif ord(ch) > 0xFFFF and unicodedata.category(ch) == "Cf":
                note("zero_width", ch,
                     f"format character {unicodedata.name(ch, '?')}", idx)

    # Homoglyph clusters: mixed scripts inside a single word (e.g. Cyrillic а
    # inside a Latin word) — a common impersonation trick on party names.
    for idx, text in enumerate(paragraphs):
        for word in re.findall(r"\S{4,}", text):
            scripts = set()
            for ch in word:
                if ch.isalpha():
                    try:
                        scripts.add(_script_of(ch))
                    except Exception:
                        pass
            if len(scripts) > 1:
                key = ("homoglyph_cluster", word[:20])
                if key not in counters:
                    counters[key] = [
                        "homoglyph_cluster", word[:20],
                        word[:12] + "…", f"mixed-script word '{word[:24]}'", 0, idx]
                counters[key][4] += 1

    for entry in counters.values():
        kind, ch, cp, label, count, first_para = entry
        report.findings.append(ScanFinding(kind, ch, cp, label, count, first_para))
    report.findings.sort(key=lambda f: (
        {"bidi": 0, "pua": 1, "homoglyph_cluster": 2,
         "zero_width": 3, "control": 4}.get(f.kind, 9), -f.count))
    return report


def _script_of(ch: str) -> str:
    o = ord(ch)
    if 0x0400 <= o <= 0x04FF:
        return "cyrillic"
    if 0x0370 <= o <= 0x03FF:
        return "greek"
    if 0x0041 <= o <= 0x024F:
        return "latin"
    return "other"


def sanitize(text: str) -> str:
    """Strip invisible characters that could steer a model. Visible text is
    untouched — this cannot corrupt the lawyer's words."""
    out = []
    for ch in text:
        if ch in _ZERO_WIDTHS or ch in _BIDI or ch in _SUSPICIOUS_CONTROLS:
            continue
        if 0xE000 <= ord(ch) <= 0xF8FF:
            continue
        out.append(ch)
    return "".join(out)
