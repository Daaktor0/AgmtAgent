"""Read-only web surfaces: run reports and matter dashboards.

Routes (all unlisted-token based — no auth wall, but unguessable):

  /runs/{run_id}/report            full review report
  /m/{matter_id}?t={share_token}   matter dashboard

Share tokens are stored on the run/matter row (share_token column added by
migration 0007) and issued lazily: the first GET with ?issue=1 creates one.
The Word pane fetches the token via /api/runs/{id}/share so the lawyer can
copy the link straight from the pane.

These pages are strictly read-only. The Word pane remains the single writer.
"""

from __future__ import annotations

import secrets

from fastapi.responses import HTMLResponse

from agent.memory.store import get_store
from agent.orchestrator.state import RunState
from .web import esc, page, run_status_pill, sev_class


def _ensure_share_token(table: str, row_id: str) -> str | None:
    """Lazily create a share token; returns None if migration is absent."""
    store = get_store()
    col = "id"
    try:
        with store._lock:
            cols = [r[1] for r in store._conn.execute(
                f"PRAGMA table_info({table})").fetchall()]
            if "share_token" not in cols:
                return None
            row = store._conn.execute(
                f"SELECT share_token FROM {table} WHERE {col}=?",
                (row_id,)).fetchone()
            if row is None:
                return None
            if row["share_token"]:
                return row["share_token"]
            token = secrets.token_urlsafe(16)
            store._conn.execute(
                f"UPDATE {table} SET share_token=? WHERE {col}=?",
                (token, row_id))
            store._conn.commit()
            return token
    except Exception:
        return None


def register_routes(app) -> None:
    @app.get("/api/runs/{run_id}/share")
    def share_link(run_id: str):
        """Pane-facing: returns the unlisted report URL for a finished run."""
        store = get_store()
        run = store.get_run(run_id)
        if not run:
            return {"error": "no such run"}
        token = _ensure_share_token("run", run_id)
        if token is None:
            return {"error": "share links unavailable (schema upgrade needed)"}
        return {"url": f"/runs/{run_id}/report?t={token}"}

    # ------------------------------------------------------------- report

    @app.get("/runs/{run_id}/report", response_class=HTMLResponse)
    def run_report(run_id: str, t: str = ""):
        store = get_store()
        run = store.get_run(run_id)
        if not run:
            return HTMLResponse(page("Not found",
                                     "<div class='empty'>No such review."
                                     "</div>"), status_code=404)
        expected = _ensure_share_token("run", run_id)
        if expected and t != expected:
            return HTMLResponse(page("Private report",
                "<div class='empty'>This report is private. Ask for a fresh "
                "share link from the Agmt pane.</div>"), status_code=403)

        issues = store.get_run_issues(run_id)
        st = RunState.coerce(run["status"]) or RunState.DONE
        counts = {"high": 0, "medium": 0, "low": 0}
        for i in issues:
            sev = sev_class(i.get("severity"))
            if sev in counts and i.get("reviewer_verdict") != "drop":
                counts[sev] += 1

        meta = f"""
<div class="meta">
  <div><b>Status</b>{run_status_pill(run["status"])}</div>
  <div><b>Mode</b>{esc((run.get('mode') or '?').upper())}</div>
  <div><b>Findings</b>{len(issues)} recorded</div>
  <div><b>High / Medium / Low</b>{counts['high']} / {counts['medium']} / {counts['low']}</div>
  <div><b>Date</b>{esc((run.get('ended_at') or run.get('started_at') or '')[:10])}</div>
</div>"""

        body = meta
        summary = run.get("summary") or ""
        if summary:
            body += f"<h2>Summary</h2><div class='card'><div class='summary'>{esc(summary)}</div></div>"

        body += "<h2>Findings</h2>"
        if not issues:
            body += ("<div class='empty'>No findings were recorded for this "
                     "review.</div>")
        for i in issues:
            if i.get("reviewer_verdict") == "drop":
                continue  # dropped issues are noise; reports show what stood
            verdict = i.get("reviewer_verdict") or "unreviewed"
            old = i.get("old_text") or ""
            quote = ""
            if old:
                ins = f"<div class='ins'>{esc(i['new_text'])}</div>" if i.get("new_text") else ""
                quote = (f"<div class='quote'><div class='del'>{esc(old)}</div>"
                         f"{ins}</div>")
            note = ""
            for label, key in (("Reviewer", "reviewer_note"),
                               ("Consequence of getting this wrong", "consequence")):
                if i.get(key):
                    note += (f"<div class='note'><b>{label}</b>"
                             f"{esc(i[key])}</div>")
            body += f"""
<div class="issue {sev_class(i.get('severity'))}">
  <div class="head">
    <div class="kicker">
      <span class="ref">{esc(i.get('ref') or '—')}</span>
      <span class="sev {sev_class(i.get('severity'))}">{esc(i.get('severity') or 'low')}</span>
      <span class="verdict {esc(verdict)}">{esc(verdict)}</span>
    </div>
    <div class="title">{esc(i.get('title') or '')}</div>
  </div>
  <div class="body">{quote}{note}</div>
</div>"""

        dropped = sum(1 for i in issues if i.get("reviewer_verdict") == "drop")
        if dropped:
            body += (f"<p class='note' style='margin-top:14px'>{dropped} "
                     f"provisional finding(s) were dropped by the independent "
                     f"reviewer and are excluded here.</p>")
        return HTMLResponse(page(
            f"Review of {(run.get('instruction') or mode_label(run)).strip()[:80]}",
            body,
            subtitle=f"Matter review · shared from the Agmt Word add-in"))

    def mode_label(run: dict) -> str:
        return f"mode {(run.get('mode') or '').upper()} review"

    # ------------------------------------------------------ matter dashboard

    @app.get("/m/{matter_id}", response_class=HTMLResponse)
    def matter_dashboard(matter_id: str, t: str = ""):
        store = get_store()
        repo = getattr(store, "matters", None)
        matter = repo.get_matter(matter_id) if repo else None
        if not matter:
            return HTMLResponse(page("Not found",
                "<div class='empty'>No such matter.</div>"), status_code=404)
        expected = _ensure_share_token("matter", matter_id)
        if expected and t != expected:
            return HTMLResponse(page("Private dashboard",
                "<div class='empty'>This dashboard is private.</div>"),
                status_code=403)

        docs = repo.list_documents(matter_id)
        rows = ""
        for d in docs:
            versions = repo.list_versions(d["id"])
            cur = repo.get_document(d["id"]) or {}
            v_info = f"v{versions[-1]['version_no']}" if versions else "—"
            rows += (f"<tr><td>{esc(d['filename'] or '(untitled)')}</td>"
                     f"<td><span class='pill'>{esc(d['role'])}</span></td>"
                     f"<td>{v_info}</td>"
                     f"<td>{len(versions)}</td></tr>")
        docs_html = (f"<table><tr><th>Document</th><th>Role</th>"
                     f"<th>Current</th><th>Versions</th></tr>{rows}</table>"
                     if docs else "<div class='empty'>No documents yet.</div>")

        with store._lock:
            runs = [dict(r) for r in store._conn.execute(
                "SELECT id, mode, status, started_at, summary FROM run"
                " ORDER BY started_at DESC LIMIT 25").fetchall()]
        run_rows = ""
        for r_ in runs:
            share = _ensure_share_token("run", r_["id"])
            link = (f"<a href='/runs/{r_['id']}/report?t={share}'>report</a>"
                    if share else "")
            run_rows += (f"<tr><td>{r_['started_at'][:10]}</td>"
                         f"<td>{esc((r_['mode'] or '?').upper())}</td>"
                         f"<td>{run_status_pill(r_['status'])}</td>"
                         f"<td>{link or '—'}</td></tr>")
        runs_html = (f"<table><tr><th>Date</th><th>Mode</th><th>Status</th>"
                     f"<th>Report</th></tr>{run_rows}</table>"
                     if run_rows else "<div class='empty'>No reviews yet."
                     "</div>")

        positions = store.active_positions()
        pos_rows = "".join(
            f"<tr><td>{esc(p['topic'])}</td><td>{esc(p['statement'] or '')}</td>"
            f"<td><span class='pill {'ok' if p['polarity']=='pro' else 'pen'}'>"
            f"{esc(p['polarity'])}</span></td>"
            f"<td>{p['evidence_count']}</td></tr>"
            for p in positions[:20])
        pos_html = (f"<table><tr><th>Topic</th><th>Position</th><th>Polarity</th>"
                    f"<th>Evidence</th></tr>{pos_rows}</table>"
                    if pos_rows else "<div class='empty'>No settled positions "
                    "yet — they form as dispositions accumulate.</div>")

        body = f"""
<div class="meta">
  <div><b>Client</b>{esc(matter.get('client') or '—')}</div>
  <div><b>Counterparty</b>{esc(matter.get('counterparty') or '—')}</div>
  <div><b>Governing law</b>{esc(matter.get('governing_law') or '—')}</div>
  <div><b>Status</b>{run_status_pill(matter.get('status'))}</div>
</div>
<h2>Documents</h2>{docs_html}
<h2>Recent reviews</h2>{runs_html}
<h2>House positions</h2>{pos_html}"""
        return HTMLResponse(page(f"Matter: {matter['name']}", body))
