"""Shared HTML rendering for Agmt web surfaces (report + matter dashboard).

Read-only views over data the Word workflow produced. Same design language as
the task pane: counsel's desk — paper, ink, one red pen. No JavaScript
framework; server-rendered, printable, shareable.
"""

from __future__ import annotations

import html

from agent.orchestrator.state import RunState


def esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def page(title: str, body: str, *, subtitle: str = "") -> str:
    sub = f'<p class="sub">{esc(subtitle)}</p>' if subtitle else ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>{esc(title)} — Agmt</title>
<style>
:root {{
  --paper:#f6f5f1; --card:#fff; --ink:#1c211e; --ink2:#3d443f;
  --muted:#6b7370; --faint:#9aa19c; --line:#e3e1da; --canvas:#efede7;
  --accent:#23423a; --pen:#a12d1f; --pen-soft:#fbeeeb;
  --amber:#8f5f1e; --amber-soft:#faf3e4; --ok:#2e6b45; --ok-soft:#ecf4ee;
  --serif:Georgia,"Times New Roman",serif;
  --sans:"Segoe UI",-apple-system,system-ui,sans-serif;
}}
* {{ box-sizing:border-box; }}
body {{ margin:0; font:14px/1.6 var(--sans); color:var(--ink);
       background:linear-gradient(180deg,#fbfaf7,var(--paper) 200px); }}
header {{ background:linear-gradient(180deg,#26332d,#1d2723); color:#e8ece6;
          padding:16px 22px; display:flex; align-items:center; gap:10px; }}
header .mark {{ font:700 12px/1 var(--serif); letter-spacing:.1em;
                padding:4px 7px; border:1px solid rgba(223,230,218,.45);
                border-radius:4px; color:#dfe6da; }}
header .word {{ font:600 17px/1 var(--serif); color:#fff; }}
main {{ max-width:860px; margin:0 auto; padding:26px 20px 60px; }}
h1 {{ font:650 24px/1.3 var(--serif); margin:0 0 4px; }}
.sub {{ color:var(--muted); margin:0 0 22px; font-size:13px; }}
h2 {{ font:650 11px/1 var(--sans); text-transform:uppercase; letter-spacing:.09em;
      color:var(--muted); margin:30px 0 10px; padding-bottom:6px;
      border-bottom:1px solid var(--line); }}
.card {{ background:var(--card); border:1px solid var(--line);
         border-radius:6px; box-shadow:0 1px 2px rgba(28,33,30,.06); }}
.summary {{ padding:14px 18px; border-left:3px solid var(--accent);
            font:15px/1.65 var(--serif); white-space:pre-wrap; }}
.issue {{ background:var(--card); border:1px solid var(--line);
          border-left:3px solid var(--faint); border-radius:6px;
          margin-top:12px; box-shadow:0 1px 2px rgba(28,33,30,.06); }}
.issue.high  {{ border-left-color:var(--pen); }}
.issue.medium{{ border-left-color:var(--amber); }}
.issue > .head {{ padding:12px 16px; }}
.kicker {{ display:flex; gap:8px; align-items:center; margin-bottom:5px;
           flex-wrap:wrap; }}
.ref {{ font:700 12px/1.2 var(--serif); background:var(--canvas);
        color:var(--ink2); padding:2px 8px; border-radius:999px; }}
.issue.high .ref {{ color:var(--pen); background:var(--pen-soft); }}
.sev {{ font-size:9.5px; text-transform:uppercase; letter-spacing:.08em;
        font-weight:700; padding:2px 8px; border-radius:999px; }}
.sev.high {{ color:var(--pen); background:var(--pen-soft); }}
.sev.medium {{ color:var(--amber); background:var(--amber-soft); }}
.sev.low {{ color:var(--muted); background:var(--canvas); }}
.verdict {{ margin-left:auto; font-size:9.5px; font-weight:700;
            letter-spacing:.07em; text-transform:uppercase; padding:3px 7px;
            border-radius:999px; background:var(--ok-soft); color:var(--ok); }}
.verdict.drop,.verdict.downgrade {{ background:var(--pen-soft); color:var(--pen); }}
.verdict.unreviewed {{ background:var(--canvas); color:var(--muted); }}
.title {{ font-weight:650; font-size:14px; }}
.consequence {{ margin:6px 0 0; color:var(--muted); font-size:13.5px;
                line-height:1.55; }}
.body {{ padding:0 16px 14px; }}
.quote {{ margin:10px 0; border:1px solid var(--line); border-radius:4px;
          overflow:hidden; }}
.quote .del {{ background:var(--pen-soft); padding:8px 12px;
               font:13.5px/1.55 var(--serif); text-decoration:line-through;
               text-decoration-color:rgba(161,45,31,.55); color:#5f2418; }}
.quote .ins {{ background:var(--ok-soft); padding:8px 12px;
               font:13.5px/1.55 var(--serif); color:#1d4028;
               border-top:1px solid var(--line); }}
.note {{ font-size:12.5px; color:var(--muted); margin:8px 0 0; }}
.note b {{ font-size:10px; text-transform:uppercase; letter-spacing:.07em;
           display:block; color:var(--faint); margin-bottom:2px; }}
table {{ width:100%; border-collapse:collapse; font-size:13px;
         background:var(--card); border:1px solid var(--line);
         border-radius:6px; overflow:hidden; }}
th {{ text-align:left; font-size:10px; text-transform:uppercase;
      letter-spacing:.07em; color:var(--muted); background:var(--canvas);
      padding:9px 12px; border-bottom:1px solid var(--line); }}
td {{ padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }}
tr:last-child td {{ border-bottom:none; }}
.pill {{ display:inline-block; padding:2px 8px; border-radius:999px;
         font-size:11px; background:var(--canvas); color:var(--ink2); }}
.pill.ok {{ background:var(--ok-soft); color:var(--ok); }}
.pill.pen {{ background:var(--pen-soft); color:var(--pen); }}
.pill.amber {{ background:var(--amber-soft); color:var(--amber); }}
.meta {{ display:flex; gap:18px; flex-wrap:wrap; margin:0 0 20px;
         padding:12px 16px; background:var(--card); border:1px solid var(--line);
         border-radius:6px; font-size:12.5px; }}
.meta div b {{ display:block; font-size:10px; text-transform:uppercase;
               letter-spacing:.07em; color:var(--muted); }}
footer {{ max-width:860px; margin:0 auto; padding:0 20px 40px;
          color:var(--faint); font-size:11.5px; }}
a {{ color:var(--accent); }}
.empty {{ padding:26px; text-align:center; color:var(--muted);
          border:1px dashed var(--line-strong); border-radius:6px; }}
@media print {{ header {{ -webkit-print-color-adjust:exact; }} }}
</style>
</head>
<body>
<header><span class="mark">Ag</span><span class="word">Agmt</span></header>
<main><h1>{esc(title)}</h1>{sub}{body}</main>
<footer>Generated by Agmt · agreement review with verbatim evidence ·
this link is unlisted; anyone holding it can read this report.</footer>
</body></html>"""


def sev_class(severity: str | None) -> str:
    return (severity or "low").strip().lower()


def run_status_pill(status: str | None) -> str:
    st = RunState.coerce(status) or RunState.DONE
    mapping = {RunState.DONE: "ok", RunState.PARTIAL: "amber",
               RunState.FAILED: "pen", RunState.CANCELLED: "",
               RunState.RUNNING: "", RunState.REVIEWING: "",
               RunState.PENDING: ""}
    label = {"PARTIAL": "partial"}.get(st.name, st.value)
    cls = mapping.get(st, "")
    extra = ' class="pill {}"'.format(cls) if cls else ' class="pill"'
    return f"<span{extra}>{esc(label)}</span>"
