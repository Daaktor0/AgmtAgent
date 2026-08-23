/* Agreement Agent — Word task pane.
 *
 * Nothing here writes to the document on its own. Every change is one explicit
 * click, and every click goes in as a tracked change or a real Word comment, so
 * it is visible and reversible.
 */

const API = window.location.origin;
let ISSUES = [];
let ABORT = null;
let CAN_COMMENT = false;
let RUN_ID = null;

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

Office.onReady((info) => {
  if (info.host !== Office.HostType.Word) {
    // Web preview (phone/laptop browser): still useful for mandate + settings.
    banner("Preview mode — document reads and tracked-change writes need "
         + "Word. Everything else works here.", false);
  } else {
    CAN_COMMENT = Office.context.requirements.isSetSupported("WordApi", "1.4");
  }

  const IN_WORD = info.host === Office.HostType.Word;
  $("run").onclick = () => IN_WORD ? runReview()
    : banner("Document actions need Word. Open this add-in inside Word to run reviews.", true);
  $("checks").onclick = () => IN_WORD ? runChecks()
    : banner("Mechanical checks read the document, so they need Word too. "
           + "Settings and mandate work here.", true);
  $("stop").onclick = () => ABORT && ABORT.abort();
  $("tab-settings").onclick = toggleSettings;
  $("savekey").onclick = saveKey;
  $("saveroles").onclick = saveRoles;
  $("toggle-trace").onclick = toggleTrace;
  $("mandate-chip").onclick = () => {
    $("mandate").open = true;
    $("mandate-chip").classList.add("hidden");
  };
  document.querySelectorAll(".job").forEach((b) => {
    b.onclick = () => fillModes(b.dataset.job);
  });

  restoreMandate();
  ["party", "counterparty", "doctype", "stage", "context"].forEach((id) =>
    $(id).addEventListener("change", () => { saveMandate(); paintMandateChip(); }));
  $("mandate").addEventListener("toggle", () => {
    if (!$("mandate").open) paintMandateChip();
  });
  $("ctx-ask").onclick = () => runContextual();

  bootstrap();
});

/* ------------------------------------------------------------------ setup */

const JOBS = {
  Review: ["A", "B", "F", "I", "J", "K", "L"],
  Draft: ["C", "D", "E"],
  Negotiate: ["G", "H", "M"],
  QC: ["N"],
};
// Static fallback so the Mode dropdown is never blank on first paint;
// bootstrap() refines these with the server's live names.
const MODE_FALLBACK = {
  A: "Full agreement review", B: "Clause review", C: "Drafting / redrafting",
  D: "Surgical inline amendment", E: "Bubble comments",
  F: "Counterparty markup review", G: "Negotiation strategy",
  H: "Negotiation call prep", I: "Interpretation / explanation",
  J: "Consistency / cross-reference check", K: "Proofreading",
  L: "Comparison of versions", M: "Email summarising changes",
  N: "Near-final / pre-signing QC",
};
MODE_NAMES = { ...MODE_FALLBACK };
// Paint the default job's modes right now — no waiting for the network.
fillModes("Review");

function fillModes(job) {
  const keys = JOBS[job] || JOBS.Review;
  const sel = $("mode");
  const prev = sel.value;
  sel.innerHTML = keys.map((k) =>
    `<option value="${esc(k)}">${esc(k)} — ${esc(MODE_NAMES[k] || k)}</option>`
  ).join("");
  sel.value = keys.includes(prev) ? prev : keys[0];
  document.querySelectorAll(".job").forEach((b) => {
    b.classList.toggle("on", b.dataset.job === job);
  });
  try { localStorage.setItem("aa.job", job); } catch (e) {}
}

async function bootstrap() {
  try {
    let cfg = {};
    try { cfg = await (await fetch(`${API}/api/config`)).json(); } catch (e) {}
    const h = await (await fetch(`${API}/api/health`)).json();
    MODE_NAMES = h.modes || Object.keys(MODE_FALLBACK).reduce((a, k) =>
      (a[k] = MODE_FALLBACK[k], a), {});
    let job = "Review";
    try { job = localStorage.getItem("aa.job") || "Review"; } catch (e) {}
    if (!JOBS[job]) job = "Review";
    fillModes(job);

    // Server-managed key: hide the key entry entirely.
    if (cfg.key_managed === "server") {
      const keySection = $("apikey");
      if (keySection) {
        keySection.closest("label")?.classList.add("hidden");
        $("savekey").classList.add("hidden");
      }
      const note = document.createElement("p");
      note.className = "done";
      note.textContent = "Model access is managed by the host — no key needed.";
      $("apikey").closest("label").parentNode.insertBefore(note, $("apikey").closest("label"));
    } else if (!h.has_key) {
      banner("No OpenRouter API key yet. Open Settings to add one.", false);
      toggleSettings();
    }
    $("diag").innerHTML =
      `Host: ${esc(API)}<br>Word comment API (WordApi 1.4): ` +
      (CAN_COMMENT ? "available." : "not available in this Word build — " +
        "tracked changes and copy still work.");
    if (h.flags && h.flags.word_v2 && h.flags.contextual_command) {
      $("contextual").classList.remove("hidden");
      if (window.AgmtWord && AgmtWord.onSelectionChanged) {
        AgmtWord.onSelectionChanged(() => { paintSelectionPreview(); });
      }
      paintSelectionPreview();
    }
  } catch (e) {
    banner("Can't reach the review host at " + API + ".", true);
    $("diag").textContent = String(e);
  }
  loadModels();
}

function banner(msg, isError) {
  const b = $("banner");
  b.textContent = msg;
  b.className = "banner" + (isError ? " error" : "");
  b.classList.remove("hidden");
}

function toggleSettings() {
  $("view-review").classList.toggle("hidden");
  $("view-settings").classList.toggle("hidden");
}

const MANDATE_KEYS = ["party", "counterparty", "doctype", "stage", "context"];
function saveMandate() {
  const d = {};
  MANDATE_KEYS.forEach((k) => (d[k] = $(k).value));
  try { localStorage.setItem("aa.mandate", JSON.stringify(d)); } catch (e) {}
}
function restoreMandate() {
  try {
    const d = JSON.parse(localStorage.getItem("aa.mandate") || "{}");
    MANDATE_KEYS.forEach((k) => { if (d[k]) $(k).value = d[k]; });
  } catch (e) {}
  if (mandateFilled()) {
    $("mandate").open = false;
    paintMandateChip();
  }
}

function mandateFilled() {
  return MANDATE_KEYS.some((k) => ($(k).value || "").trim());
}

function paintMandateChip() {
  const chip = $("mandate-chip");
  const parts = ["party", "doctype", "stage"]
    .map((k) => ($(k).value || "").trim())
    .filter(Boolean);
  if (!parts.length || $("mandate").open) {
    chip.classList.add("hidden");
    return;
  }
  chip.textContent = parts.join(" · ");
  chip.classList.remove("hidden");
}

function collapseMandate() {
  if (!mandateFilled()) return;
  $("mandate").open = false;
  paintMandateChip();
}

/* ------------------------------------------------------------------ models */

async function loadModels() {
  const box = $("roles");
  box.innerHTML = "<p class='hint'>Loading catalogue from OpenRouter…</p>";
  try {
    const d = await (await fetch(`${API}/api/models`)).json();
    if (d.error) { box.innerHTML = `<p class='warn'>${esc(d.error)}</p>`; return; }
    const roles = Object.keys(d.roles);
    box.innerHTML = roles.map((r) => {
      const pinned = d.pinned[r] || "";
      const opts = [
        `<option value="">auto — currently ${esc(d.roles[r])}</option>`,
        ...d.models.map((m) =>
          `<option value="${esc(m.id)}"${m.id === pinned ? " selected" : ""}>` +
          `${esc(m.id)}${m.tools ? "" : "  (no tool calling)"}</option>`),
      ].join("");
      return `<div class="rolerow"><span>${esc(r)}</span>
        <select data-role="${esc(r)}">${opts}</select></div>`;
    }).join("") +
    `<p class="hint">The supervisor must support tool calling. Workers need not.</p>`;
  } catch (e) {
    box.innerHTML = `<p class='warn'>Could not load models: ${esc(e)}</p>`;
  }
}

async function saveKey() {
  const key = $("apikey").value.trim();
  if (!key) return;
  const r = await fetch(`${API}/api/settings`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key }),
  });
  if (r.ok) { $("apikey").value = ""; banner("Key saved.", false); loadModels(); }
}

async function saveRoles() {
  const pinned = {};
  document.querySelectorAll("#roles select").forEach((s) => {
    if (s.value) pinned[s.dataset.role] = s.value;
  });
  await fetch(`${API}/api/settings`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
  $("rolestatus").textContent = "Saved.";
  loadModels();
}

/* ------------------------------------------------------------------ document */

function apiSet(ver) {
  return Office.context.requirements.isSetSupported("WordApi", ver);
}

function indexOfPara(para, paragraphs, uids) {
  const uid = para.uniqueLocalId;
  if (uid && uids && uids.length) {
    const at = uids.indexOf(uid);
    if (at >= 0) return at;
  }
  const text = para.text || "";
  const hits = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i] === text) hits.push(i);
  }
  return hits.length === 1 ? hits[0] : (hits[0] ?? -1);
}

async function readDocument() {
  return Word.run(async (context) => {
    const body = context.document.body;
    const ps = body.paragraphs;
    const canList = apiSet("1.3");
    const canUid = apiSet("1.6");
    const fields = ["items/text"];
    if (canUid) fields.push("items/uniqueLocalId");
    if (canList) fields.push("items/listItemOrNullObject");
    ps.load(fields.join(","));
    await context.sync();
    if (canList) {
      for (const p of ps.items) {
        if (!p.listItemOrNullObject.isNullObject) {
          p.listItemOrNullObject.load("listString,level");
        }
      }
      await context.sync();
    }

    const paragraphs = [];
    const list_prefixes = [];
    const unique_local_ids = [];
    const list_levels = [];
    for (const p of ps.items) {
      paragraphs.push(p.text);
      unique_local_ids.push(canUid ? (p.uniqueLocalId || "") : "");
      let prefix = "";
      let level = null;
      if (canList && !p.listItemOrNullObject.isNullObject) {
        prefix = (p.listItemOrNullObject.listString || "").trim();
        const raw = p.listItemOrNullObject.level;
        level = typeof raw === "number" ? raw : null;
      }
      list_prefixes.push(prefix);
      list_levels.push(level);
    }

    const comments = [];
    let commentsIngested = false;
    if (apiSet("1.4")) {
      try {
        const cs = body.getComments();
        cs.load("items/id,items/authorName,items/createdDate,items/content,items/resolved");
        await context.sync();
        commentsIngested = true;
        for (const c of cs.items) {
          const range = c.getRange();
          const first = range.paragraphs.getFirst();
          first.load(canUid ? "text,uniqueLocalId" : "text");
          await context.sync();
          comments.push({
            id: c.id || "",
            block_idx: indexOfPara(first, paragraphs, unique_local_ids),
            thread_id: c.id || "",
            author: c.authorName || "",
            created_at: c.createdDate ? String(c.createdDate) : "",
            text: c.content || "",
            resolved: !!c.resolved,
          });
        }
      } catch (e) {
        commentsIngested = false;
      }
    }

    const revisions = [];
    let revisionsIngested = false;
    if (apiSet("1.6") && typeof body.getTrackedChanges === "function") {
      try {
        const ch = body.getTrackedChanges();
        ch.load("items/type,items/author,items/date,items/text");
        await context.sync();
        revisionsIngested = true;
        for (const t of ch.items) {
          const range = t.getRange();
          const first = range.paragraphs.getFirst();
          first.load(canUid ? "text,uniqueLocalId" : "text");
          await context.sync();
          const kind = String(t.type || "").toLowerCase();
          const mapped = kind.includes("delete") ? "deletion"
            : kind.includes("format") ? "format"
            : kind.includes("move") ? "move"
            : "insertion";
          revisions.push({
            id: "",
            block_idx: indexOfPara(first, paragraphs, unique_local_ids),
            type: mapped,
            author: t.author || "",
            date: t.date ? String(t.date) : "",
            text_before: mapped === "deletion" ? (t.text || "") : "",
            text_after: mapped === "deletion" ? "" : (t.text || ""),
          });
        }
      } catch (e) {
        revisionsIngested = false;
      }
    }

    const tables = [];
    let tablesIngested = false;
    try {
      const ts = body.tables;
      ts.load("items");
      await context.sync();
      tablesIngested = true;
      let n = 0;
      for (const table of ts.items) {
        table.load("values,rowCount");
        const first = table.getRange().paragraphs.getFirst();
        first.load(canUid ? "text,uniqueLocalId" : "text");
        await context.sync();
        const values = table.values || [];
        tables.push({
          id: "t" + n++,
          start_idx: indexOfPara(first, paragraphs, unique_local_ids),
          headers: values[0] || [],
          rows: values.slice(1),
        });
      }
    } catch (e) {
      tablesIngested = false;
    }

    return {
      paragraphs,
      list_prefixes,
      unique_local_ids,
      list_levels,
      comments: commentsIngested ? comments : undefined,
      revisions: revisionsIngested ? revisions : undefined,
      tables: tablesIngested ? tables : undefined,
    };
  });
}

function payload(doc) {
  const body = {
    paragraphs: doc.paragraphs,
    list_prefixes: doc.list_prefixes,
    unique_local_ids: doc.unique_local_ids || [],
    list_levels: doc.list_levels || [],
    mode: $("mode").value || "A",
    instruction: $("instruction").value,
    party: $("party").value,
    counterparty: $("counterparty").value,
    document_type: $("doctype").value,
    stage: $("stage").value,
    context: $("context").value,
  };
  if (doc.comments) body.comments = doc.comments;
  if (doc.revisions) body.revisions = doc.revisions;
  if (doc.tables) body.tables = doc.tables;
  return body;
}

/* ------------------------------------------------------------------ running */

function setBusy(btn, on) {
  if (!btn) return;
  btn.classList.toggle("loading", on);
  btn.disabled = on;
}

function resetOutput() {
  ISSUES = [];
  RUN_ID = null;
  $("issues").innerHTML = "";
  $("questions").innerHTML = "";
  $("summary").classList.add("hidden");
  $("plan").classList.add("hidden");
  $("plan").innerHTML = "";
  $("trace").innerHTML = "";
  $("trace").classList.add("hidden");
  $("toggle-trace").classList.add("hidden");
  $("toggle-trace").textContent = "Show working";
  $("status").classList.remove("hidden");
  $("empty-state").classList.add("hidden");
  $("progress").classList.remove("hidden");
}

function finishRun(msg) {
  $("progress").classList.add("hidden");
  if (msg) $("status").textContent = msg;
  if (!ISSUES.length && !$("issues").innerHTML.trim()) {
    const es = $("empty-state");
    es.classList.remove("hidden");
  }
}

function toggleTrace() {
  const hidden = $("trace").classList.toggle("hidden");
  $("toggle-trace").textContent = hidden ? "Show working" : "Hide working";
}

function trace(line) {
  const t = $("trace");
  const d = document.createElement("div");
  d.textContent = line;
  t.appendChild(d);
  t.scrollTop = t.scrollHeight;
}

async function runChecks() {
  resetOutput();
  setBusy($("checks"), true);
  $("status").textContent = "Running mechanical checks…";
  try {
    const doc = await readDocument();
    const d = await (await fetch(`${API}/api/checks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(doc)),
    })).json();
    RUN_ID = d.run_id || null;
    $("status").textContent =
      `${d.findings.length} mechanical findings · ${d.clauses} provisions · ` +
      `${d.definitions} defined terms` +
      (d.suppressed && d.suppressed.length
        ? ` · ${d.suppressed.length} checks suppressed` : "");
    d.findings.forEach((f, i) => addIssue({
      id: "m" + i, issue_id: f.issue_id, ref: f.ref, para: f.para, title: f.detail,
      classification: "drafting_defect", severity: f.severity,
      position: "clarify", consequence: f.excerpt || "",
      evidence_tier: f.evidence_tier || 1,
      certainty: f.certainty,
      _mechanical: f.check,
    }));
    collapseMandate();
    if (!d.findings.length) {
      $("issues").innerHTML =
        "<div class='empty-state'><div class='glyph'>✓</div><b>Clean</b>" +
        "No mechanical defects found. This is a deterministic pass — it does " +
        "not replace a substantive review.</div>";
    }
    finishRun(`${d.findings.length} findings · ${d.clauses} provisions · ` +
      `${d.definitions} defined terms`);
  } catch (e) {
    finishRun("Failed: " + e);
  } finally {
    setBusy($("checks"), false);
  }
}

async function runReview() {
  resetOutput();
  setBusy($("run"), true);
  $("stop").classList.remove("hidden");
  $("status").textContent = "Reading the document…";

  try {
    const doc = await readDocument();
    collapseMandate();
    $("toggle-trace").classList.remove("hidden");
    ABORT = new AbortController();
    const res = await fetch(`${API}/api/review`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(doc)), signal: ABORT.signal,
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (line) handleEvent(JSON.parse(line.slice(6)));
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") $("status").textContent = "Failed: " + e;
    else $("status").textContent = "Stopped.";
  } finally {
    setBusy($("run"), false);
    $("stop").classList.add("hidden");
    ABORT = null;
    finishRun();
  }
}

function handleEvent(ev) {
  switch (ev.event) {
    case "parsed":
      $("status").textContent =
        `${ev.paragraphs} paragraphs · ${ev.clauses} provisions · ${ev.definitions} defined terms`;
      if (ev.paragraphs > 15 && ev.clauses <= 1) {
        banner("This document has no detectable clause numbers; review is flying blind.", false);
      }
      break;
    case "model":
      trace(`supervisor: ${ev.model}`);
      break;
    case "thinking":
      trace("· " + ev.text.replace(/\s+/g, " ").slice(0, 200));
      break;
    case "tool": {
      const a = Object.entries(ev.args || {}).map(([k, v]) => `${k}=${v}`).join(" ");
      trace(`${ev.name}${a ? " " + a : ""}`);
      break;
    }
    case "issue":
      addIssue(ev.issue);
      break;
    case "plan":
      paintPlan(ev.plan);
      break;
    case "reviewer":
      $("status").textContent +=
        ` · reviewer kept ${ev.kept}` +
        (ev.dropped && ev.dropped.length ? `, dropped ${ev.dropped.length}` : "");
      break;
    case "question":
      addQuestion(ev.question);
      break;
    case "error":
      banner(ev.message, true);
      $("status").textContent = "Error.";
      break;
    case "done":
      RUN_ID = ev.run_id || RUN_ID;
      if (ev.plan) paintPlan(ev.plan);
      $("summary").textContent = ev.summary;
      $("summary").classList.remove("hidden");
      $("issues").innerHTML = "";
      ISSUES.length = 0;
      (ev.issues || []).forEach(addIssue);
      $("status").textContent = statusLine(ev.issues || []);
      if (RUN_ID) paintShareLink(RUN_ID);
      break;
  }
}

/* ------------------------------------------------------------------ rendering */

function addQuestion(q) {
  const d = document.createElement("div");
  d.className = "qcard";
  d.innerHTML = `<b>The agent needs an instruction</b><br>${esc(q.question)}` +
    (q.why ? `<div class="hint">${esc(q.why)}</div>` : "");
  $("questions").appendChild(d);
}

const CLASS_LABEL = {
  legal_defect: "legal defect",
  drafting_defect: "drafting defect",
  commercial_risk: "commercial risk",
  negotiation_preference: "negotiation preference",
  factual_point: "factual point",
};

function statusLine(issues) {
  const n = issues.length;
  const proven = issues.filter((x) => x.evidence_tier === 1 || x._mechanical).length;
  const advisory = issues.filter((x) => x.evidence_tier === 3).length;
  const parts = [`${n} finding${n === 1 ? "" : "s"}`];
  if (proven) parts.push(`${proven} proven`);
  if (advisory) parts.push(`${advisory} advisory`);
  return parts.join(" · ");
}

function paintPlan(plan) {
  if (!plan || !plan.steps || !plan.steps.length) return;
  const el = $("plan");
  el.innerHTML = `<div class="label">${plan.revised ? "Revised plan" : "Plan"}</div>`
    + (plan.focus ? `<div class="focus">${esc(plan.focus)}</div>` : "")
    + `<ol>${plan.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
  el.classList.remove("hidden");
}

function addIssue(issue) {
  const es = $("empty-state");
  if (es) es.classList.add("hidden");
  ISSUES.push(issue);
  const i = ISSUES.length - 1;
  const el = document.createElement("div");
  const tier = issue.evidence_tier || (issue._mechanical ? 1 : 2);
  const engine = !!issue._mechanical;
  el.className = `issue tier-${tier} sev-${esc(issue.severity || "low")}` +
    (engine ? " engine" : "") + (tier === 3 ? " advisory" : "");

  const hasEdit = issue.old_text && issue.anchor_verified !== false
    && tier !== 3;
  const anchorBad = issue.old_text && issue.anchor_verified === false;
  const stamp = issue.reviewer_verdict
    ? `<span class="stamp ${esc(issue.reviewer_verdict)}">${esc(issue.reviewer_verdict)}</span>`
    : (engine ? `<span class="stamp">engine</span>` : "");
  const lede = issue.consequence || "";

  el.innerHTML = `
    <div class="head">
      <div class="kicker">
        <span class="ref">${esc(issue.ref)}</span>
        <span class="sev ${esc(issue.severity)}">${esc(issue.severity)}</span>
        ${stamp}
      </div>
      <div class="title">${esc(issue.title)}</div>
      ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
    </div>
    <div class="body hidden">
      ${issue.old_text ? `<div class="field"><b>Drafting</b>
        <div class="diffbox">
          <div class="del">${esc(issue.old_text)}</div>
          ${issue.new_text ? `<div class="ins">${esc(issue.new_text)}</div>` : ""}
        </div></div>` : ""}
      ${issue.comment ? `<div class="field"><b>Bubble comment</b>
        <div class="commentbox">${esc(issue.comment)}</div></div>` : ""}
      ${(issue.consequential && issue.consequential.length)
        ? `<div class="field"><b>Consequential</b>${esc(issue.consequential.join(", "))}</div>` : ""}
      ${issue.reviewer_note ? `<div class="field"><b>Reviewer</b>${esc(issue.reviewer_note)}</div>` : ""}
      ${anchorBad ? `<div class="warn">The quoted wording was not found verbatim, so this
        cannot be inserted automatically. ${esc(issue.anchor_note || "")}</div>` : ""}
      <div class="tagline">
        <span class="tag">${esc(CLASS_LABEL[issue.classification] || issue.classification || "")}</span>
        <span class="tag">${esc((issue.position || "").replace(/_/g, " "))}</span>
        <span class="tag">para ${esc(issue.para)}</span>
        ${engine ? `<span class="tag">${esc(issue._mechanical)}</span>` : ""}
        ${issue.certainty === "heuristic" ? `<span class="certainty">heuristic</span>` : ""}
      </div>
      <div class="row">
        <button data-act="goto" data-i="${i}" type="button">Go to</button>
        ${hasEdit ? `<button data-act="track" data-i="${i}" class="primary" type="button">Apply as tracked change</button>` : ""}
        ${issue.comment && CAN_COMMENT ? `<button data-act="comment" data-i="${i}" type="button">Insert comment</button>` : ""}
        ${issue.new_text ? `<button data-act="copy" data-i="${i}" type="button">Copy drafting</button>`
                         : (issue.comment ? `<button data-act="copycomment" data-i="${i}" type="button">Copy comment</button>` : "")}
      </div>
      ${issue.issue_id ? `<div class="disp">
        <button data-disp="accepted" data-i="${i}" class="accept" type="button">Accept</button>
        <button data-disp="accepted_modified" data-i="${i}" type="button">Accept edited</button>
        <button data-disp="rejected" data-i="${i}" class="reject" type="button">Reject</button>
        <button data-disp="deferred" data-i="${i}" type="button">Defer</button>
      </div>` : ""}
      <div class="result"></div>
    </div>`;

  el.querySelector(".head").onclick = () =>
    el.querySelector(".body").classList.toggle("hidden");
  el.querySelectorAll("button[data-act]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      act(b.dataset.act, ISSUES[+b.dataset.i], el.querySelector(".result"));
    };
  });
  el.querySelectorAll("button[data-disp]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      dispose(ISSUES[+b.dataset.i], b.dataset.disp, el);
    };
  });
  $("issues").appendChild(el);
}

async function dispose(issue, action, card) {
  if (!issue.issue_id) return;
  const out = card.querySelector(".result");
  try {
    const r = await fetch(`${API}/api/issues/${encodeURIComponent(issue.issue_id)}/disposition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await r.json();
    if (d.error) { say(out, d.error, false); return; }
    issue.disposition = action;
    card.classList.add("disposed");
    say(out, action.replace(/_/g, " ") + ".", true);
  } catch (e) {
    say(out, String(e.message || e), false);
  }
}

/* ------------------------------------------------------------------ actions */

function say(node, msg, ok) {
  node.innerHTML = `<div class="${ok ? "done" : "warn"}">${esc(msg)}</div>`;
}

// Word Find treats ^ as an escape character; everything else is literal
// while match-wildcards is off.
const forWordSearch = (s) => s.replace(/\^/g, "^^");

async function paintShareLink(runId) {
  try {
    const r = await fetch(`${API}/api/runs/${encodeURIComponent(runId)}/share`);
    const d = await r.json();
    if (!d.url) return;
    const host = window.location.origin;
    const bar = document.createElement("div");
    bar.className = "sharebar";
    bar.innerHTML =
      `<div><b>Review complete.</b> Share the report:
        <a href="${host}${d.url}" target="_blank" rel="noopener">open</a>
        · <button type="button" id="copy-report" class="linkbtn">copy link</button></div>`;
    const existing = document.querySelector(".sharebar");
    if (existing) existing.remove();
    $("issues").parentNode.insertBefore(bar, $("issues"));
    $("copy-report").onclick = () => {
      navigator.clipboard && navigator.clipboard.writeText(host + d.url);
      $("copy-report").textContent = "copied";
    };
  } catch (e) { /* sharing is best-effort */ }
}

async function findRange(context, issue) {
  const ps = context.document.body.paragraphs;
  const canUid = apiSet("1.6");
  ps.load(canUid ? "items/text,items/uniqueLocalId" : "items/text");
  await context.sync();

  const needle = forWordSearch(issue.old_text);
  const opts = { matchCase: true, matchWildcards: false, ignorePunct: false };

  const tryIn = async (para) => {
    const r = para.search(needle, opts);
    r.load("items");
    await context.sync();
    return r.items.length ? r.items[0] : null;
  };

  if (issue.unique_local_id && canUid) {
    const byId = ps.items.find((p) => p.uniqueLocalId === issue.unique_local_id);
    if (byId) {
      const hit = await tryIn(byId);
      if (hit) return hit;
    }
  }

  if (issue.para >= 0 && issue.para < ps.items.length) {
    const hit = await tryIn(ps.items[issue.para]);
    if (hit) return hit;
  }
  // The paragraph index can drift once earlier edits are accepted; fall back to
  // the first exact match anywhere, but only if it is unique.
  const all = context.document.body.search(needle, opts);
  all.load("items");
  await context.sync();
  if (all.items.length === 1) return all.items[0];
  if (all.items.length > 1) throw new Error(
    `That wording appears ${all.items.length} times in the document — apply it manually.`);
  return null;
}

async function act(kind, issue, out) {
  try {
    if (kind === "copy" || kind === "copycomment") {
      const text = kind === "copy" ? issue.new_text : issue.comment;
      await navigator.clipboard.writeText(text);
      say(out, "Copied.", true);
      return;
    }

    if (kind === "goto") {
      await Word.run(async (context) => {
        const ps = context.document.body.paragraphs;
        ps.load("items");
        await context.sync();
        if (issue.para >= 0 && issue.para < ps.items.length) {
          ps.items[issue.para].getRange().select();
          await context.sync();
        }
      });
      return;
    }

    if (kind === "track") {
      await Word.run(async (context) => {
        // Never edit untracked. If the mode will not take, stop and say so
        // rather than quietly changing the document in place.
        context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
        await context.sync();
        context.document.load("changeTrackingMode");
        await context.sync();
        if (context.document.changeTrackingMode === Word.ChangeTrackingMode.off) {
          say(out, "Could not turn on change tracking, so nothing was inserted. " +
                   "Enable Review > Track Changes and try again.", false);
          return;
        }

        const range = await findRange(context, issue);
        if (!range) { say(out, "Could not find that wording in the document.", false); return; }

        if (issue.new_text) {
          range.insertText(issue.new_text, Word.InsertLocation.replace);
        } else {
          range.delete();
        }
        range.select();
        await context.sync();
        say(out, issue.new_text
          ? "Inserted as a tracked change."
          : "Deleted as a tracked change.", true);
      });
      return;
    }

    if (kind === "comment") {
      await Word.run(async (context) => {
        let range = null;
        if (issue.old_text) range = await findRange(context, issue);
        if (!range) {
          const ps = context.document.body.paragraphs;
          ps.load("items");
          await context.sync();
          if (issue.para < 0 || issue.para >= ps.items.length) {
            say(out, "Could not locate the anchor paragraph.", false); return;
          }
          range = ps.items[issue.para].getRange();
        }
        range.insertComment(issue.comment);
        range.select();
        await context.sync();
        say(out, "Comment inserted.", true);
      });
    }
  } catch (e) {
    say(out, String(e.message || e), false);
  }
}

/* ------------------------------------------------------------------ contextual */

let CTX = { envelope: null, last: null, occurrence: {} };

async function paintSelectionPreview() {
  const node = $("sel-preview");
  if (!window.AgmtWord) {
    node.textContent = "Select contractual language, then ask Agmt.";
    return;
  }
  try {
    const env = await AgmtWord.captureSelection("primary", "live");
    CTX.envelope = env;
    const text = (env.selectedText || "").trim();
    if (!text) {
      node.textContent = "Select contractual language, then ask Agmt.";
      return;
    }
    const shown = text.length > 180 ? text.slice(0, 179) + "…" : text;
    node.textContent = "Selected: " + shown;
  } catch (e) {
    node.textContent = "Select contractual language, then ask Agmt.";
  }
}

function ctxStatus(msg, show) {
  const n = $("ctx-status");
  n.textContent = msg || "";
  n.classList.toggle("hidden", !show);
}

function paintAmbiguity(payload) {
  const box = $("ctx-ambiguity");
  const refs = (((payload.command || {}).references) || []).filter((r) => r.status === "ambiguous");
  if (!refs.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const alts = [];
  refs.forEach((r) => (r.alternatives || []).forEach((c) => alts.push(c)));
  box.innerHTML = `<div>${esc(payload.message || "I found more than one potentially relevant provision.")}</div>` +
    alts.map((c) => `<button type="button" data-ref="${esc(c.ref_id)}">${esc(c.label || c.clause_ref)}</button>`).join("");
  box.classList.remove("hidden");
  box.querySelectorAll("button").forEach((b) => {
    b.onclick = () => runContextual({ chosen: [b.dataset.ref] });
  });
}

function paintCard(payload) {
  const card = payload.card || {};
  const el = $("ctx-card");
  const hooks = (card.hooks || []).join(" × ");
  const evidence = (card.evidence || []).map((e, i) => {
    const label = e.ref || ("Evidence " + (i + 1));
    return `<div class="ev-row"><span>${esc(label)}</span>` +
      `<button type="button" data-quote="${esc(e.quote || "")}" data-para="${e.para == null ? "" : e.para}">Go to</button></div>`;
  }).join("");
  const stamp = card.reviewer === "confirmed"
    ? "Independent review: Confirmed"
    : "Independent review: " + (card.reviewer || "unreviewed");
  const stampClass = card.reviewer === "confirmed" ? "" : " warn";
  el.innerHTML =
    (hooks ? `<div class="hooks">${esc(hooks)}</div>` : "") +
    `<h3>${esc(card.title || "")}</h3>` +
    `<div>${esc(card.why || "")}</div>` +
    (card.why ? `<div class="why"><strong>Why this matters</strong><br>${esc(card.why)}</div>` : "") +
    `<div class="ev-label">Evidence</div>${evidence}` +
    `<div class="reviewer-stamp${stampClass}">${esc(stamp)}</div>` +
    `<div class="row">` +
    (card.can_amend ? `<button type="button" id="ctx-show-amend">Show amendment</button>` : "") +
    `<button type="button" id="ctx-dismiss">Dismiss</button></div>`;
  el.classList.remove("hidden");
  el.querySelectorAll(".ev-row button").forEach((b) => {
    b.onclick = async () => {
      const quote = b.dataset.quote;
      const para = b.dataset.para === "" ? -1 : Number(b.dataset.para);
      if (quote && window.AgmtWord) {
        const key = quote;
        CTX.occurrence[key] = (CTX.occurrence[key] || 0);
        const loc = await AgmtWord.locateExact(quote, CTX.occurrence[key]);
        CTX.occurrence[key] = loc.index + 1;
      } else if (para >= 0 && window.AgmtWord) {
        await AgmtWord.locateParagraph(para);
      }
    };
  });
  const show = $("ctx-show-amend");
  if (show) show.onclick = () => showAmendment(payload);
  $("ctx-dismiss").onclick = () => {
    el.classList.add("hidden");
    $("ctx-amend").classList.add("hidden");
    $("ctx-ambiguity").classList.add("hidden");
  };
}

async function showAmendment(payload) {
  let amend = payload.amendment;
  if (!amend || amend.status !== "ready") {
    const ingest = window.AgmtWord ? await AgmtWord.ingestParagraphs() : { paragraphs: [] };
    const r = await fetch(`${API}/api/contextual-commands/${encodeURIComponent(payload.command_id)}/draft`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command_id: payload.command_id, paragraphs: ingest.paragraphs }),
    });
    amend = await r.json();
  }
  const box = $("ctx-amend");
  if (amend.status !== "ready") {
    box.innerHTML = `<p class="hint">${esc(amend.reason || "No amendment.")}</p>`;
    box.classList.remove("hidden");
    return;
  }
  box.innerHTML =
    `<div class="block-label">Current</div><pre>${esc(amend.current)}</pre>` +
    `<div class="block-label">Proposed</div><pre>${esc(amend.proposed)}</pre>` +
    `<div class="why">${esc(amend.reason || "")}</div>` +
    `<button type="button" class="primary" id="ctx-approve">Approve tracked change</button>`;
  box.classList.remove("hidden");
  $("ctx-approve").onclick = () => approveAmendment(amend);
}

async function approveAmendment(amend) {
  ctxStatus("Revalidating the live document…", true);
  const ingest = await AgmtWord.ingestParagraphs();
  const hash = AgmtWord.documentHash(ingest.paragraphs);
  const prep = await (await fetch(`${API}/api/actions/prepare`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: amend.action,
      paragraphs: ingest.paragraphs,
      document_version_id: (amend.action && amend.action.document_version_id) || "live",
      version_hash: hash,
      protected: await AgmtWord.documentLooksProtected(),
      capabilities: ["track_changes", "search"],
    }),
  })).json();
  if (prep.status === "refused") {
    ctxStatus("Refused: " + (prep.reason || "stale or ambiguous target") + ".", true);
    return;
  }
  ctxStatus("Applying tracked change…", true);
  const applied = await AgmtWord.applyTicket(prep.ticket);
  if (applied.status !== "confirmed") {
    ctxStatus(
      applied.status === "failed_unknown"
        ? "The write could not be verified. It was not retried."
        : "Refused: " + (applied.reason || applied.status),
      true,
    );
    return;
  }
  const after = await AgmtWord.ingestParagraphs();
  await fetch(`${API}/api/actions/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticket_id: prep.ticket.ticket_id || prep.ticket.ticketId,
      paragraphs: after.paragraphs,
      document_version_id: prep.ticket.document_version_id || "live",
      version_hash: AgmtWord.documentHash(after.paragraphs),
    }),
  });
  ctxStatus("Tracked change applied and verified.", true);
}

async function runContextual(opts) {
  opts = opts || {};
  $("ctx-card").classList.add("hidden");
  $("ctx-amend").classList.add("hidden");
  $("ctx-ambiguity").classList.add("hidden");
  ctxStatus("Capturing the selection…", true);
  try {
    await paintSelectionPreview();
    const env = CTX.envelope;
    if (!env || !(env.selectedText || "").trim()) {
      ctxStatus("Select some contractual language first.", true);
      return;
    }
    ctxStatus("Reading the agreement…", true);
    const ingest = await AgmtWord.ingestParagraphs();
    const hash = AgmtWord.documentHash(ingest.paragraphs);
    ctxStatus("Resolving selection and references…", true);
    const body = {
      matter_id: "local",
      document_id: "primary",
      document_version_id: "live",
      raw_text: $("ctx-instruction").value.trim() ||
        "Check this language against the indemnity clause for any double-recovery issue.",
      modality: "text",
      activation: "typed",
      selection: AgmtWord.envelopeToAnchor(env),
      paragraphs: ingest.paragraphs,
      list_prefixes: ingest.list_prefixes,
      unique_local_ids: ingest.unique_local_ids,
      list_levels: ingest.list_levels,
      captured_doc_hash: hash,
      live_document_hash: hash,
      chosen_ref_ids: opts.chosen || [],
    };
    const payload = await (await fetch(`${API}/api/contextual-commands`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })).json();
    CTX.last = payload;
    if (payload.state === "ambiguity") {
      ctxStatus("", false);
      paintAmbiguity(payload);
      return;
    }
    if (payload.state === "stale" || payload.state === "error" || payload.error) {
      ctxStatus(payload.error || "The command could not be completed.", true);
      return;
    }
    ctxStatus("", false);
    paintCard(payload);
  } catch (e) {
    ctxStatus(String(e.message || e), true);
  }
}
