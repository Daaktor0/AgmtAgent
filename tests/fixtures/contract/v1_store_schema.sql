CREATE INDEX idx_disp_issue ON disposition(issue_id);

CREATE INDEX idx_issue_run ON issue(run_id);

CREATE INDEX idx_pos_topic ON position(topic);

CREATE TABLE disposition (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    action TEXT NOT NULL,
    final_text TEXT,
    note TEXT,
    decided_at TEXT NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES issue(id)
);

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
