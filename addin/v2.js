/* Agmt Word library (golden slice). Feature-flagged. Does not replace taskpane.js.
 *
 * Tracking-mode serialisation, reviewed-text reads, empty/table selection
 * handling, comment stable ids, occurrence navigation and DOCX slice close are
 * adapted from Vaquill AI ms-word-addin (Apache-2.0). See THIRD_PARTY_NOTICES.md.
 * Modified: exact-text mutation only; no office-word-diff; no bulk apply.
 */
(function (global) {
  "use strict";

  function apiSet(ver) {
    try { return Office.context.requirements.isSetSupported("WordApi", ver); }
    catch (e) { return false; }
  }

  /* Minimal SHA-256 (sync) so selection hashes match the server. */
  function sha256Hex(str) {
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    const K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x196c3674,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    const bytes = unescape(encodeURIComponent(str || "")).split("").map(function (c) { return c.charCodeAt(0); });
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    for (let i = 0; i < bytes.length; i += 64) {
      const w = [];
      for (let t = 0; t < 16; t++) {
        w[t] = (bytes[i+t*4]<<24) | (bytes[i+t*4+1]<<16) | (bytes[i+t*4+2]<<8) | bytes[i+t*4+3];
      }
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t-15],7) ^ rotr(w[t-15],18) ^ (w[t-15]>>>3);
        const s1 = rotr(w[t-2],17) ^ rotr(w[t-2],19) ^ (w[t-2]>>>10);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
      }
      let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
        const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h=g; g=f; f=e; e=(d+temp1)|0; d=c; c=b; b=a; a=(temp1+temp2)|0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    return H.map(function (x) { return ("00000000" + (x>>>0).toString(16)).slice(-8); }).join("");
  }

  function documentHash(paragraphs) {
    return "sha256:" + sha256Hex((paragraphs || []).join("\n"));
  }

  function capabilities() {
    const inWord = typeof Office !== "undefined" && Office.context &&
      Office.context.host === Office.HostType.Word;
    if (!inWord) {
      return { host: "none", comments: false, trackedChanges: false, uniqueLocalId: false,
        reviewedText: false, reason: "Not running in Word." };
    }
    return {
      host: "Word",
      comments: apiSet("1.4"),
      trackedChanges: apiSet("1.6"),
      uniqueLocalId: apiSet("1.6"),
      reviewedText: apiSet("1.4"),
      footnotes: apiSet("1.5"),
      headersFooters: apiSet("1.3"),
      tables: apiSet("1.3"),
    };
  }

  let trackChain = Promise.resolve();
  function serializeTrackChanges(fn) {
    const run = trackChain.then(fn, fn);
    trackChain = run.then(function () {}, function () {});
    return run;
  }

  async function documentLooksProtected() {
    try {
      return await Word.run(async function (context) {
        const props = context.document.properties;
        props.load("security");
        await context.sync();
        return (props.security & (2 | 4 | 8)) !== 0;
      });
    } catch (e) { return false; }
  }

  function forWordSearch(s) { return String(s).replace(/\^/g, "^^"); }

  async function captureSelection(documentId, documentVersionId) {
    return Word.run(async function (context) {
      const sel = context.document.getSelection();
      const tables = sel.tables; tables.load("items");
      const paras = sel.paragraphs;
      const canUid = apiSet("1.6");
      paras.load(canUid ? "items/text,items/uniqueLocalId" : "items/text");
      let reviewed = null;
      if (apiSet("1.4") && typeof sel.getReviewedText === "function") {
        reviewed = sel.getReviewedText(Word.ChangeTrackingVersion.current);
      } else {
        sel.load("text");
      }
      const bodyParas = context.document.body.paragraphs;
      bodyParas.load(canUid ? "items/text,items/uniqueLocalId" : "items/text");
      await context.sync();
      const selectedText = (reviewed ? reviewed.value : sel.text) || "";
      const paragraphIds = [];
      paras.items.forEach(function (p) {
        if (canUid && p.uniqueLocalId) paragraphIds.push(p.uniqueLocalId);
      });
      const paragraphIndexes = [];
      bodyParas.items.forEach(function (p, i) {
        if (canUid && p.uniqueLocalId && paragraphIds.indexOf(p.uniqueLocalId) >= 0) {
          paragraphIndexes.push(i);
        }
      });
      let prefix = "", suffix = "";
      if (paragraphIndexes.length) {
        const first = paragraphIndexes[0], last = paragraphIndexes[paragraphIndexes.length - 1];
        if (first > 0) prefix = bodyParas.items[first - 1].text || "";
        if (last + 1 < bodyParas.items.length) suffix = bodyParas.items[last + 1].text || "";
      }
      return {
        selectionId: "sel-" + Date.now(),
        documentId: documentId,
        documentVersionId: documentVersionId,
        story: "body",
        selectedText: selectedText,
        selectedTextHash: sha256Hex(selectedText),
        structuralContext: {
          paragraphIds: paragraphIds,
          paragraphIndexes: paragraphIndexes,
          tablePath: tables.items.length ? { tableIndex: 0 } : undefined,
          headingPath: []
        },
        surroundingContext: {
          prefix: prefix, suffix: suffix,
          prefixHash: prefix ? sha256Hex(prefix) : "",
          suffixHash: suffix ? sha256Hex(suffix) : ""
        },
        capturedAt: new Date().toISOString()
      };
    });
  }

  function envelopeToAnchor(env) {
    const idx = (env.structuralContext && env.structuralContext.paragraphIndexes) || [];
    const ids = (env.structuralContext && env.structuralContext.paragraphIds) || [];
    return {
      story_type: env.story === "body" ? "main" : env.story,
      selected_text: env.selectedText,
      selected_text_sha256: env.selectedTextHash,
      block_ids: ids,
      unique_local_ids: ids,
      first_block_idx: idx.length ? idx[0] : null,
      last_block_idx: idx.length ? idx[idx.length - 1] : null,
      prefix_text: (env.surroundingContext && env.surroundingContext.prefix) || "",
      suffix_text: (env.surroundingContext && env.surroundingContext.suffix) || "",
      structural_path: (env.structuralContext && env.structuralContext.headingPath) || [],
      captured_at: env.capturedAt,
      source_word_api: "Document.getSelection"
    };
  }

  async function ingestParagraphs() {
    return Word.run(async function (context) {
      const body = context.document.body;
      const ps = body.paragraphs;
      const canUid = apiSet("1.6");
      const canList = apiSet("1.3");
      const fields = ["items/text"];
      if (canUid) fields.push("items/uniqueLocalId");
      if (canList) fields.push("items/listItemOrNullObject");
      ps.load(fields.join(","));
      await context.sync();
      if (canList) {
        ps.items.forEach(function (p) {
          if (!p.listItemOrNullObject.isNullObject) p.listItemOrNullObject.load("listString,level");
        });
        await context.sync();
      }
      let reviewed = null;
      if (apiSet("1.4") && ps.items.length && typeof ps.items[0].getReviewedText === "function") {
        try {
          const tracked = body.getTrackedChanges();
          tracked.load("items/type");
          await context.sync();
          if (tracked.items.length > 0) {
            reviewed = ps.items.map(function (p) {
              return p.getReviewedText(Word.ChangeTrackingVersion.current);
            });
            await context.sync();
          }
        } catch (e) { reviewed = null; }
      }
      const paragraphs = [], unique_local_ids = [], list_prefixes = [], list_levels = [];
      ps.items.forEach(function (p, i) {
        paragraphs.push(reviewed ? (reviewed[i].value || "") : (p.text || ""));
        unique_local_ids.push(canUid ? (p.uniqueLocalId || "") : "");
        let prefix = "", level = null;
        if (canList && !p.listItemOrNullObject.isNullObject) {
          prefix = (p.listItemOrNullObject.listString || "").trim();
          const raw = p.listItemOrNullObject.level;
          level = typeof raw === "number" ? raw : null;
        }
        list_prefixes.push(prefix);
        list_levels.push(level);
      });
      return { paragraphs: paragraphs, unique_local_ids: unique_local_ids,
        list_prefixes: list_prefixes, list_levels: list_levels };
    });
  }

  async function locateExact(text, index) {
    index = index || 0;
    const q = (text || "").trim();
    if (!q) return { count: 0, index: -1 };
    return Word.run(async function (context) {
      const ranges = context.document.body.search(forWordSearch(q), { matchCase: true, matchWildcards: false });
      ranges.load("items");
      await context.sync();
      if (!ranges.items.length) return { count: 0, index: -1 };
      const i = ((index % ranges.items.length) + ranges.items.length) % ranges.items.length;
      ranges.items[i].select();
      await context.sync();
      return { count: ranges.items.length, index: i };
    });
  }

  async function locateParagraph(index) {
    return Word.run(async function (context) {
      const ps = context.document.body.paragraphs;
      ps.load("items");
      await context.sync();
      if (index < 0 || index >= ps.items.length) return false;
      ps.items[index].getRange().select();
      await context.sync();
      return true;
    });
  }

  async function applyTicket(ticket) {
    if (ticket.consumed) return { status: "refused", reason: "replay", trackingRestored: true };
    if (Date.parse(ticket.expiresAt || ticket.expires_at) <= Date.now()) {
      return { status: "refused", reason: "expired", trackingRestored: true };
    }
    if (await documentLooksProtected()) {
      return { status: "refused", reason: "protected", trackingRestored: true };
    }
    const oldText = ticket.expectedOldText || ticket.expected_old_text;
    const newText = ticket.proposedText || ticket.proposed_text || "";
    const op = ticket.operation;
    return serializeTrackChanges(function () {
      return Word.run(async function (context) {
        const doc = context.document;
        doc.load("changeTrackingMode");
        await context.sync();
        const prior = doc.changeTrackingMode;
        let status = "failed_unknown";
        let reason = "failed_unknown";
        try {
          doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
          await context.sync();
          doc.load("changeTrackingMode");
          await context.sync();
          if (doc.changeTrackingMode === Word.ChangeTrackingMode.off) {
            status = "refused"; reason = "capability_unavailable";
          } else {
            const all = context.document.body.search(forWordSearch(oldText), { matchCase: true, matchWildcards: false });
            all.load("items");
            await context.sync();
            if (all.items.length === 0) { status = "refused"; reason = "stale"; }
            else if (all.items.length > 1) { status = "refused"; reason = "ambiguous_target"; }
            else {
              const range = all.items[0];
              if (op === "replace") range.insertText(newText, Word.InsertLocation.replace);
              else if (op === "delete") range.delete();
              else if (op === "comment") range.insertComment(newText);
              else if (op === "insert_before") range.insertText(newText, Word.InsertLocation.before);
              else if (op === "insert_after") range.insertText(newText, Word.InsertLocation.after);
              await context.sync();
              let live = "";
              try {
                if (typeof range.getReviewedText === "function") {
                  const reviewed = range.getReviewedText(Word.ChangeTrackingVersion.current);
                  await context.sync();
                  live = reviewed.value || "";
                }
              } catch (e) { live = ""; }
              if (op === "replace" && newText && live && live.indexOf(newText) < 0 && live !== newText) {
                status = "failed_unknown"; reason = "failed_unknown";
              } else {
                status = "confirmed"; reason = null;
              }
            }
          }
        } finally {
          try {
            doc.changeTrackingMode = prior;
            await context.sync();
          } catch (e) { /* best-effort restore */ }
        }
        return { status: status, reason: reason, trackingRestored: true };
      });
    });
  }

  function onSelectionChanged(cb) {
    const handler = function () { cb(); };
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, handler);
    return function () {
      Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler: handler });
    };
  }

  global.AgmtWord = {
    sha256Hex: sha256Hex,
    documentHash: documentHash,
    capabilities: capabilities,
    captureSelection: captureSelection,
    envelopeToAnchor: envelopeToAnchor,
    ingestParagraphs: ingestParagraphs,
    locateExact: locateExact,
    locateParagraph: locateParagraph,
    applyTicket: applyTicket,
    onSelectionChanged: onSelectionChanged,
    documentLooksProtected: documentLooksProtected,
    serializeTrackChanges: serializeTrackChanges,
    apiSet: apiSet
  };
})(window);
