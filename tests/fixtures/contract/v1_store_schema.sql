CREATE INDEX idx_audit_matter ON audit_log(matter_id, ts);

CREATE INDEX idx_block_hash ON block(document_version_id, text_sha256);

CREATE INDEX idx_block_local ON block(document_version_id, unique_local_id);

CREATE INDEX idx_block_version ON block(document_version_id);

CREATE INDEX idx_clause_version ON clause(document_version_id);

CREATE UNIQUE INDEX idx_cmd_idem
            ON contextual_command(matter_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_definition_version ON definition(document_version_id);

CREATE INDEX idx_disp_issue ON disposition(issue_id);

CREATE UNIQUE INDEX idx_document_word_doc_id ON document(word_doc_id)
            WHERE word_doc_id IS NOT NULL;

CREATE INDEX idx_issue_run ON issue(run_id);

CREATE UNIQUE INDEX idx_matter_share ON matter(share_token)
            WHERE share_token IS NOT NULL;

CREATE INDEX idx_pos_topic ON position(topic);

CREATE INDEX idx_proposal_issue ON action_proposal(issue_id);

CREATE INDEX idx_run_event_run ON run_event(run_id, seq);

CREATE UNIQUE INDEX idx_run_share ON run(share_token)
            WHERE share_token IS NOT NULL;

CREATE TABLE action_proposal (
            id TEXT PRIMARY KEY, issue_id TEXT REFERENCES issue(id),
            command_id TEXT REFERENCES contextual_command(id), operation TEXT,
            precondition_json TEXT, new_text TEXT, comment TEXT, risk TEXT,
            approval_status TEXT, applied_at TEXT, result_json TEXT);

CREATE TABLE audit_log (
            id TEXT PRIMARY KEY, ts TEXT NOT NULL, actor TEXT, matter_id TEXT,
            action TEXT NOT NULL, subject_type TEXT, subject_id TEXT,
            detail_json TEXT);

CREATE TABLE block (
            id TEXT PRIMARY KEY,
            document_version_id TEXT NOT NULL REFERENCES document_version(id),
            idx INTEGER, kind TEXT, text TEXT, text_sha256 TEXT,
            list_prefix TEXT, list_level INTEGER, style TEXT,
            style_built_in TEXT, story_type TEXT, table_id TEXT, row INTEGER,
            col INTEGER, section TEXT, footnote_ref TEXT,
            unique_local_id TEXT, char_start INTEGER, char_end INTEGER,
            structural_path_json TEXT);

CREATE TABLE clause (
            id TEXT PRIMARY KEY,
            document_version_id TEXT NOT NULL REFERENCES document_version(id),
            number TEXT, kind TEXT, heading TEXT, start_idx INTEGER,
            end_idx INTEGER, depth INTEGER, confidence REAL, detected_by TEXT);

CREATE TABLE companion_session (
            id TEXT PRIMARY KEY, matter_id TEXT, pairing_token_hash TEXT,
            transport TEXT, status TEXT, created_at TEXT, closed_at TEXT);

CREATE TABLE contextual_command (
            id TEXT PRIMARY KEY, parent_id TEXT, matter_id TEXT,
            document_id TEXT, document_version_id TEXT, modality TEXT,
            activation TEXT, selection_json TEXT, raw_input_json TEXT,
            intent_json TEXT, references_json TEXT, status TEXT,
            run_id TEXT REFERENCES run(id), idempotency_key TEXT,
            provenance_json TEXT, created_at TEXT, resolved_at TEXT,
            error_json TEXT);

CREATE TABLE contextual_reference (
            id TEXT PRIMARY KEY,
            command_id TEXT NOT NULL REFERENCES contextual_command(id),
            kind TEXT, candidate_ids_json TEXT, selected_id TEXT,
            status TEXT, created_at TEXT);

CREATE TABLE definition (
            id TEXT PRIMARY KEY,
            document_version_id TEXT NOT NULL REFERENCES document_version(id),
            term TEXT, defined_at_idx INTEGER, text TEXT,
            usage_idxs_json TEXT, scope TEXT);

CREATE TABLE disposition (
            id TEXT PRIMARY KEY, issue_id TEXT NOT NULL, action TEXT NOT NULL,
            final_text TEXT, note TEXT, decided_at TEXT NOT NULL,
            FOREIGN KEY (issue_id) REFERENCES issue(id));

CREATE TABLE document (
            id TEXT PRIMARY KEY, matter_id TEXT REFERENCES matter(id), role TEXT,
            filename TEXT, word_doc_id TEXT, current_version_id TEXT,
            created_at TEXT);

CREATE TABLE document_version (
            id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES document(id),
            version_no INTEGER, version_label TEXT, doc_hash TEXT, source TEXT,
            ingest_schema_version TEXT, capabilities_json TEXT,
            ingested_at TEXT, supersedes_id TEXT);

CREATE TABLE issue (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL, local_id INTEGER,
            ref TEXT, block_idx INTEGER, title TEXT, classification TEXT,
            severity TEXT, position TEXT, consequence TEXT, old_text TEXT,
            new_text TEXT, comment TEXT, evidence_tier INTEGER,
            check_name TEXT, payload_json TEXT, check_id TEXT, check_version TEXT, family TEXT, certainty TEXT, anchor_verified INTEGER, anchor_method TEXT, block_id TEXT, overlap_trace_json TEXT, consequential_json TEXT, provenance_json TEXT, reviewer_verdict TEXT, reviewer_note TEXT, status TEXT,
            FOREIGN KEY (run_id) REFERENCES run(id));

CREATE TABLE matter (
            id TEXT PRIMARY KEY, name TEXT, client TEXT, party_represented TEXT,
            counterparty TEXT, deal_type TEXT, governing_law TEXT,
            status TEXT DEFAULT 'active', created_at TEXT, archived_at TEXT, share_token TEXT);

CREATE TABLE position (
            id TEXT PRIMARY KEY, scope TEXT, scope_key TEXT, topic TEXT NOT NULL,
            statement TEXT, polarity TEXT, evidence_count INTEGER DEFAULT 1,
            confidence REAL DEFAULT 0, source_issue_ids_json TEXT,
            active INTEGER DEFAULT 0, created_at TEXT, last_reinforced_at TEXT,
            user_edited INTEGER DEFAULT 0, contradiction_count INTEGER DEFAULT 0, precedent_clause TEXT);

CREATE TABLE run (
            id TEXT PRIMARY KEY, mode TEXT, mandate_json TEXT, instruction TEXT,
            status TEXT, started_at TEXT, ended_at TEXT,
            tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0,
            cost_usd REAL DEFAULT 0, steps_used INTEGER DEFAULT 0,
            summary TEXT, plan_json TEXT, matter_id TEXT, document_version_id TEXT, engine_version TEXT, skill_version TEXT, model_roles_json TEXT, provider_provenance_json TEXT, budget_json TEXT, lease_until TEXT, last_event_seq INTEGER, share_token TEXT);

CREATE TABLE run_checkpoint (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES run(id),
            seq INTEGER NOT NULL, state_json TEXT, plan_json TEXT,
            messages_hash TEXT, created_at TEXT);

CREATE TABLE run_event (
            id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES run(id),
            seq INTEGER NOT NULL, ts TEXT NOT NULL, event_type TEXT NOT NULL,
            payload_json TEXT, latency_ms INTEGER, tokens_in INTEGER,
            tokens_out INTEGER, cost_usd REAL);

CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT, checksum TEXT);
