BEGIN TRANSACTION;
CREATE TABLE disposition (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    action TEXT NOT NULL,
    final_text TEXT,
    note TEXT,
    decided_at TEXT NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES issue(id)
);
INSERT INTO "disposition" VALUES('<id:3>','<id:4>','rejected','','','<ts:1>');
INSERT INTO "disposition" VALUES('<id:5>','<id:4>','rejected','','','<ts:1>');
INSERT INTO "disposition" VALUES('<id:6>','<id:4>','rejected','','','<ts:1>');
INSERT INTO "disposition" VALUES('<id:7>','<id:8>','accepted','','','<ts:1>');
INSERT INTO "disposition" VALUES('<id:9>','<id:10>','accepted_modified','','Unfilled placeholder ''[●]''.','<ts:1>');
INSERT INTO "disposition" VALUES('<id:11>','<id:12>','deferred','','','<ts:1>');
CREATE TABLE issue (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    local_id INTEGER,
    ref TEXT,
    block_idx INTEGER,
    title TEXT,
    classification TEXT,
    severity TEXT,
    position TEXT,
    consequence TEXT,
    old_text TEXT,
    new_text TEXT,
    comment TEXT,
    evidence_tier INTEGER,
    check_name TEXT,
    payload_json TEXT,
    FOREIGN KEY (run_id) REFERENCES run(id)
);
INSERT INTO "issue" VALUES('<id:4>','<id:13>',1,'2.1',13,'Figure and words disagree: 45,00,00,000 vs "Forty Four Crore" (= 440,000,000).','drafting_defect','high','','','','','',1,'amount_mismatch','{"check": "amount_mismatch", "check_id": "amount.figure_word_mismatch", "family": "amount", "severity": "high", "para": 13, "ref": "2.1", "detail": "Figure and words disagree: 45,00,00,000 vs \"Forty Four Crore\" (= 440,000,000).", "excerpt": "INR 45,00,00,000 (Rupees Forty Four Crore only)", "certainty": "exact", "evidence_tier": 1, "id": 1, "title": "Figure and words disagree: 45,00,00,000 vs \"Forty Four Crore\" (= 440,000,000).", "classification": "drafting_defect", "_mechanical": "amount_mismatch", "issue_id": "<id:4>"}');
INSERT INTO "issue" VALUES('<id:8>','<id:13>',2,'2.2',14,'Reference to Clause 2.4 — no such clause found in this document.','drafting_defect','high','','','','','',1,'broken_cross_reference','{"check": "broken_cross_reference", "check_id": "structure.broken_xref", "family": "structure", "severity": "high", "para": 14, "ref": "2.2", "detail": "Reference to Clause 2.4 — no such clause found in this document.", "excerpt": "… be paid in immediately available funds to the account notified under Clause 2.4.", "certainty": "exact", "evidence_tier": 1, "id": 2, "title": "Reference to Clause 2.4 — no such clause found in this document.", "classification": "drafting_defect", "_mechanical": "broken_cross_reference", "issue_id": "<id:8>"}');
INSERT INTO "issue" VALUES('<id:10>','<id:13>',3,'3.3',17,'Unfilled placeholder ''[●]''.','drafting_defect','high','','','','','',1,'unfilled_placeholder','{"check": "unfilled_placeholder", "check_id": "exec.unfilled_placeholder", "family": "exec", "severity": "high", "para": 17, "ref": "3.3", "detail": "Unfilled placeholder ''[●]''.", "excerpt": "…all use best efforts to satisfy the Conditions Precedent on or before [●].", "certainty": "exact", "evidence_tier": 1, "id": 3, "title": "Unfilled placeholder ''[●]''.", "classification": "drafting_defect", "_mechanical": "unfilled_placeholder", "issue_id": "<id:10>"}');
INSERT INTO "issue" VALUES('<id:12>','<id:13>',4,'6.4',29,'A blanket borrow prohibition swallows a stated numeric threshold.','drafting_defect','high','','','','','',1,'threshold_conflict','{"check": "threshold_conflict", "check_id": "threshold.conflict", "family": "threshold", "severity": "high", "para": 29, "ref": "6.4", "detail": "A blanket borrow prohibition swallows a stated numeric threshold.", "excerpt": "6.4 The Company shall not, without Investor Majority consent, incur any borrowing whatsoever other than trade credit in the ordinary course.", "certainty": "heuristic", "evidence_tier": 1, "id": 4, "title": "A blanket borrow prohibition swallows a stated numeric threshold.", "classification": "drafting_defect", "_mechanical": "threshold_conflict", "issue_id": "<id:12>"}');
INSERT INTO "issue" VALUES('<id:14>','<id:13>',5,'7.2',32,'Reference to Clause 7.5 — no such clause found in this document.','drafting_defect','high','','','','','',1,'broken_cross_reference','{"check": "broken_cross_reference", "check_id": "structure.broken_xref", "family": "structure", "severity": "high", "para": 32, "ref": "7.2", "detail": "Reference to Clause 7.5 — no such clause found in this document.", "excerpt": "7.2 The tag along rights of the Investor are set out in Clause 7.5.", "certainty": "exact", "evidence_tier": 1, "id": 5, "title": "Reference to Clause 7.5 — no such clause found in this document.", "classification": "drafting_defect", "_mechanical": "broken_cross_reference", "issue_id": "<id:14>"}');
INSERT INTO "issue" VALUES('<id:15>','<id:13>',6,'8.1',34,'Reference to Clause 11.2 — no such clause found in this document.','drafting_defect','high','','','','','',1,'broken_cross_reference','{"check": "broken_cross_reference", "check_id": "structure.broken_xref", "family": "structure", "severity": "high", "para": 34, "ref": "8.1", "detail": "Reference to Clause 11.2 — no such clause found in this document.", "excerpt": "…terminated by mutual written consent of the parties, or as set out in Clause 11.2.", "certainty": "exact", "evidence_tier": 1, "id": 6, "title": "Reference to Clause 11.2 — no such clause found in this document.", "classification": "drafting_defect", "_mechanical": "broken_cross_reference", "issue_id": "<id:15>"}');
INSERT INTO "issue" VALUES('<id:16>','<id:13>',7,'3.1',16,'Numbering gap under 3.: 3.2 missing.','drafting_defect','medium','','','','','',1,'numbering_gap','{"check": "numbering_gap", "check_id": "structure.numbering_gap", "family": "structure", "severity": "medium", "para": 16, "ref": "3.1", "detail": "Numbering gap under 3.: 3.2 missing.", "excerpt": "", "certainty": "exact", "evidence_tier": 1, "id": 7, "title": "Numbering gap under 3.: 3.2 missing.", "classification": "drafting_defect", "_mechanical": "numbering_gap", "issue_id": "<id:16>"}');
INSERT INTO "issue" VALUES('<id:17>','<id:18>',1,'5.2',23,'Reference to Clause 5.1 (5.1) does not match the citing context.','drafting_defect','medium','','','','','',1,'xref_implausible','{"check": "xref_implausible", "check_id": "structure.xref_implausible", "family": "structure", "severity": "medium", "para": 23, "ref": "5.2", "detail": "Reference to Clause 5.1 (5.1) does not match the citing context.", "excerpt": "5.2 The aggregate liability of the Company under Clause 5.1 shall not exceed the Subscription Amount.", "certainty": "heuristic", "evidence_tier": 1, "id": 1, "title": "Reference to Clause 5.1 (5.1) does not match the citing context.", "classification": "drafting_defect", "_mechanical": "xref_implausible", "issue_id": "<id:17>"}');
INSERT INTO "issue" VALUES('<id:19>','<id:18>',2,'5.3',24,'Reference to Clause 5.1 (5.1) does not match the citing context.','drafting_defect','medium','','','','','',1,'xref_implausible','{"check": "xref_implausible", "check_id": "structure.xref_implausible", "family": "structure", "severity": "medium", "para": 24, "ref": "5.3", "detail": "Reference to Clause 5.1 (5.1) does not match the citing context.", "excerpt": "5.3 Where the Company makes a payment to the Investor under Clause 5.1, the amount payable shall be grossed up by reference to the Investor''…", "certainty": "heuristic", "evidence_tier": 1, "id": 2, "title": "Reference to Clause 5.1 (5.1) does not match the citing context.", "classification": "drafting_defect", "_mechanical": "xref_implausible", "issue_id": "<id:19>"}');
INSERT INTO "issue" VALUES('<id:20>','<id:18>',3,'Schedule 1',35,'Schedule 1 has fewer than 15 body words under the heading.','drafting_defect','medium','','','','','',1,'empty_schedule','{"check": "empty_schedule", "check_id": "structure.empty_schedule", "family": "structure", "severity": "medium", "para": 35, "ref": "Schedule 1", "detail": "Schedule 1 has fewer than 15 body words under the heading.", "excerpt": "", "certainty": "exact", "evidence_tier": 1, "id": 3, "title": "Schedule 1 has fewer than 15 body words under the heading.", "classification": "drafting_defect", "_mechanical": "empty_schedule", "issue_id": "<id:20>"}');
INSERT INTO "issue" VALUES('<id:21>','<id:18>',4,'Schedule 3',37,'Schedule 3 has fewer than 15 body words under the heading.','drafting_defect','medium','','','','','',1,'empty_schedule','{"check": "empty_schedule", "check_id": "structure.empty_schedule", "family": "structure", "severity": "medium", "para": 37, "ref": "Schedule 3", "detail": "Schedule 3 has fewer than 15 body words under the heading.", "excerpt": "Conditions Precedent ", "certainty": "exact", "evidence_tier": 1, "id": 4, "title": "Schedule 3 has fewer than 15 body words under the heading.", "classification": "drafting_defect", "_mechanical": "empty_schedule", "issue_id": "<id:21>"}');
INSERT INTO "issue" VALUES('<id:22>','<id:18>',5,'1.1',4,'"Affiliate" is defined but never used in an operative provision.','drafting_defect','low','','','','','',1,'defined_but_unused','{"check": "defined_but_unused", "check_id": "defterm.unused", "family": "defterm", "severity": "low", "para": 4, "ref": "1.1", "detail": "\"Affiliate\" is defined but never used in an operative provision.", "excerpt": "", "certainty": "exact", "evidence_tier": 1, "id": 5, "title": "\"Affiliate\" is defined but never used in an operative provision.", "classification": "drafting_defect", "_mechanical": "defined_but_unused", "issue_id": "<id:22>"}');
INSERT INTO "issue" VALUES('<id:23>','<id:18>',6,'1.1',5,'"Business Plan" is defined but never used in an operative provision.','drafting_defect','low','','','','','',1,'defined_but_unused','{"check": "defined_but_unused", "check_id": "defterm.unused", "family": "defterm", "severity": "low", "para": 5, "ref": "1.1", "detail": "\"Business Plan\" is defined but never used in an operative provision.", "excerpt": "", "certainty": "exact", "evidence_tier": 1, "id": 6, "title": "\"Business Plan\" is defined but never used in an operative provision.", "classification": "drafting_defect", "_mechanical": "defined_but_unused", "issue_id": "<id:23>"}');
INSERT INTO "issue" VALUES('<id:24>','<id:18>',7,'1.1',8,'"Material Adverse Effect" is defined but never used in an operative provision.','drafting_defect','low','','','','','',1,'defined_but_unused','{"check": "defined_but_unused", "check_id": "defterm.unused", "family": "defterm", "severity": "low", "para": 8, "ref": "1.1", "detail": "\"Material Adverse Effect\" is defined but never used in an operative provision.", "excerpt": "", "certainty": "exact", "evidence_tier": 1, "id": 7, "title": "\"Material Adverse Effect\" is defined but never used in an operative provision.", "classification": "drafting_defect", "_mechanical": "defined_but_unused", "issue_id": "<id:24>"}');
INSERT INTO "issue" VALUES('<id:25>','<id:18>',8,'4.1',19,'"Business Warranties" is used 2 times in capitalised form but no definition was found. Confirm whether it is intended as a defined term.','drafting_defect','low','','','','','',1,'possibly_undefined_term','{"check": "possibly_undefined_term", "check_id": "defterm.undefined_candidate", "family": "defterm", "severity": "low", "para": 19, "ref": "4.1", "detail": "\"Business Warranties\" is used 2 times in capitalised form but no definition was found. Confirm whether it is intended as a defined term.", "excerpt": "", "certainty": "heuristic", "evidence_tier": 1, "id": 8, "title": "\"Business Warranties\" is used 2 times in capitalised form but no definition was found. Confirm whether it is intended as a defined term.", "classification": "drafting_defect", "_mechanical": "possibly_undefined_term", "issue_id": "<id:25>"}');
CREATE TABLE position (
    id TEXT PRIMARY KEY,
    scope TEXT,
    scope_key TEXT,
    topic TEXT NOT NULL,
    statement TEXT,
    polarity TEXT,
    evidence_count INTEGER DEFAULT 1,
    confidence REAL DEFAULT 0,
    source_issue_ids_json TEXT,
    active INTEGER DEFAULT 0,
    created_at TEXT,
    last_reinforced_at TEXT,
    user_edited INTEGER DEFAULT 0
);
INSERT INTO "position" VALUES('<id:26>','global','','amount_mismatch','Figure and words disagree: 45,00,00,000 vs "Forty Four Crore" (= 440,000,000).','avoid',3,0.3,'["<id:4>"]',1,'<ts:1>','<ts:1>',0);
INSERT INTO "position" VALUES('<id:27>','global','','broken_cross_reference','Reference to Clause 2.4 — no such clause found in this document.','prefer',1,0.3,'["<id:8>"]',0,'<ts:1>','<ts:1>',0);
INSERT INTO "position" VALUES('<id:28>','global','','unfilled_placeholder','Unfilled placeholder ''[●]''.','prefer',1,0.3,'["<id:10>"]',0,'<ts:1>','<ts:1>',0);
CREATE TABLE run (
    id TEXT PRIMARY KEY,
    mode TEXT,
    mandate_json TEXT,
    instruction TEXT,
    status TEXT,
    started_at TEXT,
    ended_at TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    steps_used INTEGER DEFAULT 0,
    summary TEXT,
    plan_json TEXT
);
INSERT INTO "run" VALUES('<id:13>','A','{"party_represented": "Company"}','','done','<ts:1>','<ts:1>',0,0,0.0,8,'Two points matter.',NULL);
INSERT INTO "run" VALUES('<id:18>','checks','{}','','done','<ts:1>','<ts:1>',0,0,0.0,0,'8 mechanical findings',NULL);
CREATE INDEX idx_issue_run ON issue(run_id);
CREATE INDEX idx_disp_issue ON disposition(issue_id);
CREATE INDEX idx_pos_topic ON position(topic);
COMMIT;
