/**
 * Removing a line of text from a PDF page for real, not just painting over
 * it: a template's sample name must not survive in the page's text layer,
 * where copy-paste or a text reader would still find another party's name.
 *
 * The page's content stream is tokenised, the graphics and text state are
 * followed just far enough to know where each text-showing operator starts,
 * and the operators that start on the name are cut out. Every other byte of
 * the stream is kept as it was.
 */
import { PDFArray, PDFName, PDFRawStream, decodePDFRawStream, type PDFPage, type PDFStream } from "pdf-lib";

type Token = { kind: "num" | "name" | "str" | "array" | "dict" | "op" | "other"; start: number; end: number; text: string };

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set("()<>[]{}/%".split("").map((c) => c.charCodeAt(0)));

function skipString(b: Uint8Array, i: number): number {
  // b[i] === "("
  let depth = 0;
  for (; i < b.length; i += 1) {
    const c = b[i];
    if (c === 0x5c) {
      i += 1;
      continue;
    }
    if (c === 0x28) depth += 1;
    else if (c === 0x29 && --depth === 0) return i + 1;
  }
  return b.length;
}

function skipHex(b: Uint8Array, i: number): number {
  while (i < b.length && b[i] !== 0x3e) i += 1;
  return i + 1;
}

function skipArray(b: Uint8Array, i: number): number {
  // b[i] === "["
  let depth = 0;
  while (i < b.length) {
    const c = b[i];
    if (c === 0x28) i = skipString(b, i);
    else if (c === 0x3c && b[i + 1] !== 0x3c) i = skipHex(b, i);
    else {
      if (c === 0x5b) depth += 1;
      else if (c === 0x5d && --depth === 0) return i + 1;
      i += 1;
    }
  }
  return b.length;
}

function skipDict(b: Uint8Array, i: number): number {
  let depth = 0;
  while (i < b.length) {
    if (b[i] === 0x3c && b[i + 1] === 0x3c) {
      depth += 1;
      i += 2;
    } else if (b[i] === 0x3e && b[i + 1] === 0x3e) {
      i += 2;
      if (--depth === 0) return i;
    } else if (b[i] === 0x28) i = skipString(b, i);
    else i += 1;
  }
  return b.length;
}

const latin = (b: Uint8Array, s: number, e: number) => String.fromCharCode(...b.subarray(s, Math.min(e, s + 64)));

export function tokenize(b: Uint8Array): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    if (WS.has(c)) {
      i += 1;
      continue;
    }
    if (c === 0x25) {
      while (i < b.length && b[i] !== 0x0a && b[i] !== 0x0d) i += 1;
      continue;
    }
    const start = i;
    let kind: Token["kind"];
    if (c === 0x28) {
      i = skipString(b, i);
      kind = "str";
    } else if (c === 0x3c && b[i + 1] === 0x3c) {
      i = skipDict(b, i);
      kind = "dict";
    } else if (c === 0x3c) {
      i = skipHex(b, i);
      kind = "str";
    } else if (c === 0x5b) {
      i = skipArray(b, i);
      kind = "array";
    } else if (c === 0x2f) {
      i += 1;
      while (i < b.length && !WS.has(b[i]) && !DELIM.has(b[i])) i += 1;
      kind = "name";
    } else if (DELIM.has(c)) {
      i += 1;
      kind = "other";
    } else {
      while (i < b.length && !WS.has(b[i]) && !DELIM.has(b[i])) i += 1;
      const word = latin(b, start, i);
      kind = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) ? "num" : "op";
      if (word === "ID") {
        // Inline image data runs to the next "EI" standing alone.
        let j = i + 1;
        while (j < b.length - 1 && !(b[j] === 0x45 && b[j + 1] === 0x49 && WS.has(b[j - 1]) && (j + 2 >= b.length || WS.has(b[j + 2])))) j += 1;
        out.push({ kind: "op", start, end: i, text: "ID" });
        i = j;
        continue;
      }
    }
    out.push({ kind, start, end: i, text: kind === "num" || kind === "op" || kind === "name" ? latin(b, start, i) : "" });
  }
  return out;
}

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
/** a × b, PDF's row-vector convention. */
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

export type TextTarget = { x: number; y: number; width: number };

/**
 * Byte ranges of the text-showing operators (with their operands) that
 * start on one of the targets. A show that follows a removed one on the
 * same line without a new position is the rest of the same name, and goes
 * too.
 */
export function rangesToRemove(b: Uint8Array, targets: TextTarget[]): [number, number][] {
  const tokens = tokenize(b);
  const ranges: [number, number][] = [];
  let ctm: M = [...I];
  const stack: M[] = [];
  let tm: M = [...I];
  let tlm: M = [...I];
  let leading = 0;
  let operands: Token[] = [];
  let positioned = true;
  let lastRemoved = false;

  const hits = () => {
    const x = tm[4] * ctm[0] + tm[5] * ctm[2] + ctm[4];
    const y = tm[4] * ctm[1] + tm[5] * ctm[3] + ctm[5];
    return targets.some((t) => Math.abs(y - t.y) < 1.5 && x >= t.x - 1.5 && x <= t.x + Math.max(1.5, t.width - 1));
  };
  const nums = () => operands.filter((t) => t.kind === "num").map((t) => Number(t.text));
  const nextLine = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = [...tlm];
    positioned = true;
  };

  for (const tok of tokens) {
    if (tok.kind !== "op") {
      operands.push(tok);
      continue;
    }
    const n = nums();
    switch (tok.text) {
      case "q":
        stack.push([...ctm]);
        break;
      case "Q":
        ctm = stack.pop() ?? [...I];
        break;
      case "cm":
        if (n.length === 6) ctm = mul(n as M, ctm);
        break;
      case "BT":
        tm = [...I];
        tlm = [...I];
        positioned = true;
        lastRemoved = false;
        break;
      case "Tm":
        if (n.length === 6) {
          tm = n as M;
          tlm = [...tm];
          positioned = true;
        }
        break;
      case "Td":
        if (n.length === 2) nextLine(n[0], n[1]);
        break;
      case "TD":
        if (n.length === 2) {
          leading = -n[1];
          nextLine(n[0], n[1]);
        }
        break;
      case "TL":
        if (n.length === 1) leading = n[0];
        break;
      case "T*":
        nextLine(0, -leading);
        break;
      case "Tj":
      case "TJ":
      case "'":
      case '"': {
        if (tok.text === "'" || tok.text === '"') nextLine(0, -leading);
        const remove: boolean = positioned ? hits() : lastRemoved;
        if (remove) {
          const from = operands[0]?.start ?? tok.start;
          ranges.push([from, tok.end]);
          // A quote operator also moved to the next line: keep that move.
          if (tok.text !== "Tj" && tok.text !== "TJ") ranges.push([-1, -1]);
        }
        lastRemoved = remove;
        positioned = false;
        break;
      }
      default:
        break;
    }
    operands = [];
  }
  return ranges;
}

function splice(b: Uint8Array, ranges: [number, number][]): Uint8Array {
  const parts: Uint8Array[] = [];
  let at = 0;
  const encoder = new TextEncoder();
  for (let k = 0; k < ranges.length; k += 1) {
    const [s, e] = ranges[k];
    if (s < 0) continue;
    parts.push(b.subarray(at, s));
    // A removed ' or " still moves to the next line.
    parts.push(encoder.encode(ranges[k + 1]?.[0] === -1 ? " T* " : " "));
    at = e;
  }
  parts.push(b.subarray(at));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** The page's content, decoded, as one byte array (several streams are joined). */
function pageContent(page: PDFPage): Uint8Array | null {
  const contents = page.node.Contents();
  if (!contents) return null;
  const streams: PDFStream[] = [];
  // Only streams as they were read from the file; anything drawn since
  // (not yet encoded) means this is being called too late, so leave it be.
  const parts = contents instanceof PDFArray ? Array.from({ length: contents.size() }, (_, i) => page.node.context.lookup(contents.get(i))) : [contents];
  for (const part of parts) {
    if (!(part instanceof PDFRawStream)) return null;
    streams.push(part);
  }
  if (!streams.length) return null;
  const decoded = streams.map((s) => decodePDFRawStream(s as PDFRawStream).decode());
  const total = decoded.reduce((n, d) => n + d.length + 1, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const d of decoded) {
    out.set(d, o);
    o += d.length;
    out[o++] = 0x0a;
  }
  return out;
}

/**
 * Remove the text drawn at the targets from the page's own content.
 * Returns how many text operators were removed; 0 means the text could not
 * be found there (for example, it sits inside a nested form), and the
 * caller should say so.
 */
export function removeTextAt(page: PDFPage, targets: TextTarget[]): number {
  const content = pageContent(page);
  if (!content) return 0;
  const ranges = rangesToRemove(content, targets);
  const removed = ranges.filter(([s]) => s >= 0).length;
  if (!removed) return 0;
  const next = splice(content, ranges);
  const stream = page.node.context.flateStream(next);
  page.node.set(PDFName.of("Contents"), page.node.context.register(stream));
  return removed;
}
