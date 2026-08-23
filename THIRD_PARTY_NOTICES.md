# Third-party notices

This product includes original Agmt code and, where noted, adaptations of
third-party software.

## Vaquill AI for Word (ms-word-addin)

Copyright 2026 Vaquill AI

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
Source: https://github.com/Vaquill-AI/ms-word-addin
Inspected revision: fd53dba73448e57cf97f48e409494938cdacbf77

Agmt does not fork the Vaquill application. Selected Office.js mechanics were
adapted into an Agmt-owned Word library under `addin/src/word/`:

- reviewed-current text reads (`getReviewedText`)
- empty-selection and table-selection safeguards
- selection-change subscription
- serialised change-tracking mode save/restore
- protected / read-only document detection
- comment lookup by stable id, reply, resolve
- occurrence navigation and bookmarks
- compressed DOCX slice acquisition with close

Files that contain derived mechanics carry a per-file notice.

The following Vaquill patterns are **not** imported:

- browser-side provider / API-key architecture
- review or negotiation state stored in DOCX custom XML
- alphanumeric-only / fuzzy equality as a mutation precondition
- bulk “Apply all” / “Apply clean”
- `office-word-diff` as a mutation engine
- text-only document comparison as legal comparison
- chat-first product hierarchy, legal intelligence, or provider UI
- Web Speech API as Agmt's voice architecture

`office-word-diff` and `diff-match-patch` are listed in Vaquill's NOTICE and
are not used by Agmt.

A copy of the Apache-2.0 license text is reproduced below for redistribution.

---

Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and
distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the
copyright owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other
entities that control, are controlled by, or are under common control with
that entity. For the purposes of this definition, "control" means (i) the
power, direct or indirect, to cause the direction or management of such
entity, whether by contract or otherwise, or (ii) ownership of fifty percent
(50%) or more of the outstanding shares, or (iii) beneficial ownership of
such entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising
permissions granted by this License.

"Source" form shall mean the preferred form for making modifications,
including but not limited to software source code, documentation source, and
configuration files.

"Object" form shall mean any form resulting from mechanical transformation
or translation of a Source form, including but not limited to compiled object
code, generated documentation, and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or Object form,
made available under the License, as indicated by a copyright notice that is
included in or attached to the work.

"Derivative Works" shall mean any work, whether in Source or Object form,
that is based on (or derived from) the Work and for which the editorial
revisions, annotations, elaborations, or other modifications represent, as a
whole, an original work of authorship. For the purposes of this License,
Derivative Works shall not include works that remain separable from, or
merely link (or bind by name) to the interfaces of, the Work and Derivative
Works thereof.

"Contribution" shall mean any work of authorship, including the original
version of the Work and any modifications or additions to that Work or
Derivative Works thereof, that is intentionally submitted to Licensor for
inclusion in the Work by the copyright owner or by an individual or Legal
Entity authorized to submit on behalf of the copyright owner.

"Contributor" shall mean Licensor and any individual or Legal Entity on
behalf of whom a Contribution has been received by Licensor and subsequently
incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of this
License, each Contributor hereby grants to You a perpetual, worldwide,
non-exclusive, no-charge, royalty-free, irrevocable copyright license to
reproduce, prepare Derivative Works of, publicly display, publicly perform,
sublicense, and distribute the Work and such Derivative Works in Source or
Object form.

3. Grant of Patent License. Subject to the terms and conditions of this
License, each Contributor hereby grants to You a perpetual, worldwide,
non-exclusive, no-charge, royalty-free, irrevocable (except as stated in this
section) patent license to make, have made, use, offer to sell, sell, import,
and otherwise transfer the Work, where such license applies only to those
patent claims licensable by such Contributor that are necessarily infringed
by their Contribution(s) alone or by combination of their Contribution(s)
with the Work to which such Contribution(s) was submitted.

4. Redistribution. You may reproduce and distribute copies of the Work or
Derivative Works thereof in any medium, with or without modifications, and in
Source or Object form, provided that You meet the following conditions:

(a) You must give any other recipients of the Work or Derivative Works a copy
of this License; and

(b) You must cause any modified files to carry prominent notices stating that
You changed the files; and

(c) You must retain, in the Source form of any Derivative Works that You
distribute, all copyright, patent, trademark, and attribution notices from
the Source form of the Work; and

(d) If the Work includes a "NOTICE" text file as part of its distribution,
then any Derivative Works that You distribute must include a readable copy of
the attribution notices contained within such NOTICE file.

END OF TERMS AND CONDITIONS


## LegalQuants lq-skills

Copyright 2026 LegalQuants contributors

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
Source: https://github.com/LegalQuants/lq-skills

Selected review playbooks (nda-review, msa-review-saas,
msa-review-commercial-purchase, dpa-checklist-review, contract-qa) are
fetched at runtime as supplementary reference material and appended to the
system prompt below the core Agreement Skill. The core skill's rules take
precedence on any conflict. Skills remain the work of their authors; Agmt
adds no edits and stores cached copies only.

## LegalQuants noroboto (concepts)

Copyright 2026 LegalQuants contributors · MIT licence
Source: https://github.com/LegalQuants/noroboto

The pre-ingest hidden-character scan (agent/document_scan.py) is adapted
from noroboto's Unicode-obfuscation detection concepts: zero-width, bidi
override, private-use-area, and mixed-script detection. Reimplemented for
Agmt's paragraph model; no noroboto code is copied.
