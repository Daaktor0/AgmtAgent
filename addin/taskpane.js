/* Agreement Agent — Word task pane.
 *
 * Nothing here writes to the document on its own. Every change is one explicit
 * click, and every click goes in as a tracked change or a real Word comment, so
 * it is visible and reversible.
 */

const API = "https://localhost:8787";
let ISSUES = [];
let ABORT = null;
let CAN_COMMENT = false;

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

Office.onReady((info) => {
  if (info.host !== Office.HostType.Word) {
    banner("This add-in runs in Word.", true);
    return;
  }
  CAN_COMMENT = Office.context.requirements.isSetSupported("WordApi", "1.4");

  $("run").onclick = () => runReview();
  $("checks").onclick = () => runChecks();
  $("stop").onclick = () => ABORT && ABORT.abort();
  $("tab-settings").onclick = toggleSettings;
  $("savekey").onclick = saveKey;
  $("saveroles").onclick = saveRoles;

  restoreMandate();
  ["party", "counterparty", "doctype", "stage", "context"].forEach((id) =>
    $(id).addEventListener("change", saveMandate));

  bootstrap();
});

/* ------------------------------------------------------------------ setup */

async function bootstrap() {
  try {
    const h = await (await fetch(`${API}/api/health`)).json();
    const sel = $("mode");
    sel.innerHTML = Object.entries(h.modes)
      .map(([k, v]) => `<option value="${k}">${k} — ${esc(v)}</option>`)
      .join("");
    if (!h.has_key) {
      banner("No OpenRouter API key yet. Open Settings to add one.", false);
      toggleSettings();
    }
    $("diag").innerHTML =
      `Local agent: reachable.<br>Word comment API (WordApi 1.4): ` +
      (CAN_COMMENT ? "available." : "not available in this Word build — " +
        "tracked changes and copy still work.");
  } catch (e) {
    banner(
      "Can't reach the local agent at " + API + ". Start it with start.ps1, and if " +
      "this is the first run, open " + API + "/taskpane.html in Edge once to accept " +
      "the certificate.", true);
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

async function readParagraphs() {
  return Word.run(async (context) => {
    const ps = context.document.body.paragraphs;
    const canList = Office.context.requirements.isSetSupported("WordApi", "1.3");
    ps.load(canList ? "items/text,items/listItemOrNullObject" : "items/text");
    await context.sync();
    if (canList) {
      for (const p of ps.items) {
        if (!p.listItemOrNullObject.isNullObject) {
          p.listItemOrNullObject.load("listString");
        }
      }
      await context.sync();
    }

    const paragraphs = [];
    const list_prefixes = [];
    for (const p of ps.items) {
      paragraphs.push(p.text);
      let prefix = "";
      if (canList && !p.listItemOrNullObject.isNullObject) {
        prefix = (p.listItemOrNullObject.listString || "").trim();
      }
      list_prefixes.push(prefix);
    }
    return { paragraphs, list_prefixes };
  });
}

function payload(doc) {
  return {
    paragraphs: doc.paragraphs,
    list_prefixes: doc.list_prefixes,
    mode: $("mode").value || "A",
    instruction: $("instruction").value,
    party: $("party").value,
    counterparty: $("counterparty").value,
    document_type: $("doctype").value,
    stage: $("stage").value,
    context: $("context").value,
  };
}

/* ------------------------------------------------------------------ running */

function resetOutput() {
  ISSUES = [];
  $("issues").innerHTML = "";
  $("questions").innerHTML = "";
  $("summary").classList.add("hidden");
  $("trace").innerHTML = "";
  $("trace").classList.remove("hidden");
  $("status").classList.remove("hidden");
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
  $("status").textContent = "Running mechanical checks…";
  try {
    const doc = await readParagraphs();
    const d = await (await fetch(`${API}/api/checks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(doc)),
    })).json();
    $("status").textContent =
      `${d.paragraphs} paragraphs · ${d.clauses} provisions · ` +
      `${d.definitions} defined terms · ${d.findings.length} mechanical findings`;
    $("trace").classList.add("hidden");
    d.findings.forEach((f, i) => addIssue({
      id: "m" + i, ref: f.ref, para: f.para, title: f.detail,
      classification: "drafting_defect", severity: f.severity,
      position: "clarify", consequence: f.excerpt || "",
      _mechanical: f.check,
    }));
    if (!d.findings.length) {
      $("issues").innerHTML = "<p class='done'>No mechanical defects found.</p>";
    }
  } catch (e) {
    $("status").textContent = "Failed: " + e;
  }
}

async function runReview() {
  resetOutput();
  $("run").disabled = true;
  $("stop").classList.remove("hidden");
  $("status").textContent = "Reading the document…";

  try {
    const doc = await readParagraphs();
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
    $("run").disabled = false;
    $("stop").classList.add("hidden");
    ABORT = null;
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
    case "question":
      addQuestion(ev.question);
      break;
    case "error":
      banner(ev.message, true);
      $("status").textContent = "Error.";
      break;
    case "done":
      $("summary").textContent = ev.summary;
      $("summary").classList.remove("hidden");
      $("status").textContent += ` · ${ev.issues.length} issues recorded`;
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

function addIssue(issue) {
  ISSUES.push(issue);
  const i = ISSUES.length - 1;
  const el = document.createElement("div");
  el.className = "issue";

  const hasEdit = issue.old_text && issue.anchor_verified !== false;
  const anchorBad = issue.old_text && issue.anchor_verified === false;

  el.innerHTML = `
    <div class="head">
      <span class="sev ${esc(issue.severity)}">${esc(issue.severity)}</span>
      <span class="ref">${esc(issue.ref)}</span>
      <span class="title">${esc(issue.title)}</span>
    </div>
    <div class="body hidden">
      <div class="tagline">
        <span class="tag">${esc(CLASS_LABEL[issue.classification] || issue.classification)}</span>
        <span class="tag">${esc((issue.position || "").replace(/_/g, " "))}</span>
        <span class="tag">para ${esc(issue.para)}</span>
      </div>
      ${issue.consequence ? `<div class="field"><b>Consequence</b>${esc(issue.consequence)}</div>` : ""}
      ${issue.old_text ? `<div class="field"><b>Drafting</b>
        <div class="diffbox">
          <div class="del">${esc(issue.old_text)}</div>
          ${issue.new_text ? `<div class="ins">${esc(issue.new_text)}</div>` : ""}
        </div></div>` : ""}
      ${issue.comment ? `<div class="field"><b>Bubble comment</b>
        <div class="commentbox">${esc(issue.comment)}</div></div>` : ""}
      ${(issue.consequential && issue.consequential.length)
        ? `<div class="field"><b>Consequential</b>${esc(issue.consequential.join(", "))}</div>` : ""}
      ${anchorBad ? `<div class="warn">The quoted wording was not found verbatim, so this
        cannot be inserted automatically. ${esc(issue.anchor_note || "")}</div>` : ""}
      <div class="row">
        <button data-act="goto" data-i="${i}">Go to</button>
        ${hasEdit ? `<button data-act="track" data-i="${i}" class="primary">Apply as tracked change</button>` : ""}
        ${issue.comment && CAN_COMMENT ? `<button data-act="comment" data-i="${i}">Insert comment</button>` : ""}
        ${issue.new_text ? `<button data-act="copy" data-i="${i}">Copy drafting</button>`
                         : (issue.comment ? `<button data-act="copycomment" data-i="${i}">Copy comment</button>` : "")}
      </div>
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
  $("issues").appendChild(el);
}

/* ------------------------------------------------------------------ actions */

function say(node, msg, ok) {
  node.innerHTML = `<div class="${ok ? "done" : "warn"}">${esc(msg)}</div>`;
}

// Word Find treats ^ as an escape character; everything else is literal
// while match-wildcards is off.
const forWordSearch = (s) => s.replace(/\^/g, "^^");

async function findRange(context, issue) {
  const ps = context.document.body.paragraphs;
  ps.load("items/text");
  await context.sync();

  const needle = forWordSearch(issue.old_text);
  const opts = { matchCase: true, matchWildcards: false, ignorePunct: false };

  const tryIn = async (para) => {
    const r = para.search(needle, opts);
    r.load("items");
    await context.sync();
    return r.items.length ? r.items[0] : null;
  };

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
