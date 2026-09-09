/**
 * Technical prototype only. Not a production Proof route. Synthetic DOCX only.
 * Document bytes stay in page memory. No Agmt upload, analytics, or storage.
 */
import "./shims/buffer.ts";
import JSZip from "jszip";
import { launchFixture, LAUNCH_FIXTURES, DEMO_EXPECTED, DEMO_ACCEPTED, DEMO_SENTENCE } from "../../src/lib/agmt/corpus/launch-fixtures.ts";
import { buildDocx } from "../../src/lib/agmt/docx.ts";
import { exportProofDocx, validateProofExport } from "../../src/lib/agmt/export/docx.ts";
import { analyzeProof } from "../../src/lib/agmt/proof/launch.ts";
import { extractDocx } from "../../src/lib/agmt/docx-v2.ts";
import { admitLocalDocument, EICAR_SIGNATURE } from "./malware.ts";
import { sha256Hex } from "./shims/sha256.ts";

type FixtureKind = (typeof LAUNCH_FIXTURES)[number] | "medium_repeat" | "large_repeat";

const networkAttempts: string[] = [];
const storageWrites: string[] = [];
let lastObjectUrl: string | null = null;
let lastOutput: Uint8Array | null = null;

function installNetworkTripwires(): void {
  const reject = (target: unknown) => {
    networkAttempts.push(String(target));
    return Promise.reject(new Error("network_forbidden"));
  };
  globalThis.fetch = ((input: RequestInfo | URL) => reject(typeof input === "object" && "url" in input ? input.url : input)) as typeof fetch;
  globalThis.XMLHttpRequest = class {
    open() { networkAttempts.push("xhr"); }
    send() { throw new Error("network_forbidden"); }
  } as unknown as typeof XMLHttpRequest;
  if (navigator.sendBeacon) {
    navigator.sendBeacon = (url: string | URL) => {
      networkAttempts.push(String(url));
      return false;
    };
  }
  const OriginalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class {
    constructor(url: string | URL) {
      networkAttempts.push(String(url));
      throw new Error("network_forbidden");
    }
  } as unknown as typeof OriginalWebSocket;
}

function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

function installStorageTripwires(): void {
  const proto = Object.getPrototypeOf(localStorage) as Storage;
  const original = proto.setItem;
  proto.setItem = function setItem(this: Storage, key: string, value: string) {
    const name = this === sessionStorage ? "sessionStorage" : "localStorage";
    storageWrites.push(`${name}:${key}:${value.length}`);
    if (/PK\x03\x04/.test(value) || value.length > 256) {
      throw new Error("document_storage_forbidden");
    }
    original.call(this, key, value);
  };
}

function heapBytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory?.usedJSHeapSize ?? null;
}

function bytesToBase64(bytes: Uint8Array): string {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buffer.byteLength > 1_500_000) return "";
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function processBytes(bytes: Uint8Array, label: string) {
  const started = performance.now();
  const heapBefore = heapBytes();
  const sourceSha256 = sha256Hex(bytes);
  const malware = admitLocalDocument(bytes, sourceSha256);
  if (malware.status === "refused") {
    return {
      label,
      ok: false,
      refused: malware.reason,
      malware,
      durationMs: Math.round(performance.now() - started),
      heapBefore,
      heapAfter: heapBytes(),
      networkAttempts: [...networkAttempts],
      storageWrites: [...storageWrites],
    };
  }
  const analysis = await analyzeProof(Buffer.from(bytes) as Buffer);
  const exported = await exportProofDocx(Buffer.from(bytes) as Buffer, new Date("2026-09-05T00:00:00Z"));
  await validateProofExport(Buffer.from(bytes) as Buffer, exported.bytes, exported.receipt, exported.analysis);
  const zip = await JSZip.loadAsync(exported.bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  const commentsXml = await zip.file("word/comments.xml")?.async("string") ?? "";
  const extracted = await extractDocx(exported.bytes);
  lastOutput = new Uint8Array(exported.bytes);
  if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
  lastObjectUrl = URL.createObjectURL(new Blob([lastOutput.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }));
  return {
    label,
    ok: true,
    sourceBytes: bytes.byteLength,
    outputBytes: exported.bytes.byteLength,
    sourceSha256,
    outputSha256: sha256Hex(exported.bytes),
    coverage: analysis.coverage,
    findings: analysis.plan.findings.map((finding) => ({
      ruleId: finding.ruleId,
      kind: finding.kind,
      quote: finding.exactQuote,
      replacement: finding.replacement,
      start: finding.primarySpan.textStart,
      end: finding.primarySpan.textEnd,
    })),
    corrections: exported.receipt.plan.findings.filter((finding) => finding.kind === "correction").length,
    comments: exported.receipt.commentIds.length,
    notices: exported.receipt.plan.notices.length,
    revisionIds: exported.receipt.revisionIds,
    hasIns: /<w:ins\b/.test(xml),
    hasDel: /<w:del\b/.test(xml),
    hasDelText: /<w:delText\b/.test(xml),
    hasCommentRange: /<w:commentRangeStart\b/.test(xml),
    authorAgmt: /w:author="Agmt Proof"/.test(xml) || /w:author="Agmt Proof"/.test(commentsXml),
    extractedText: extracted.blocks[0]?.text ?? "",
    originalSentence: DEMO_SENTENCE,
    acceptedSentence: DEMO_ACCEPTED,
    expected: DEMO_EXPECTED,
    malware,
    sdkInBrowser: false,
    wordComInBrowser: false,
    clamavInBrowser: false,
    durationMs: Math.round(performance.now() - started),
    heapBefore,
    heapAfter: heapBytes(),
    downloadUrl: lastObjectUrl,
    outputBase64: bytesToBase64(exported.bytes),
    sourceBase64: bytesToBase64(bytes),
    networkAttempts: [...networkAttempts],
    storageWrites: [...storageWrites],
    localStorageKeys: storageKeys(localStorage),
    sessionStorageKeys: storageKeys(sessionStorage),
  };
}

async function fixtureBytes(kind: FixtureKind): Promise<Uint8Array> {
  if (kind === "medium_repeat" || kind === "large_repeat") {
    const count = kind === "large_repeat" ? 8000 : 800;
    const paragraphs = Array.from({ length: count }, (_, index) => (
      index === 0
        ? "The Company shall recieve the the notice under Clause 99.2 by [●]."
        : `The Company shall deliver notice number ${index} in accordance with this Agreement.`
    ));
    return new Uint8Array(await buildDocx(paragraphs));
  }
  return new Uint8Array(await launchFixture(kind));
}

async function refuseCase(name: string, mutate: (zip: JSZip) => Promise<void> | void) {
  const zip = await JSZip.loadAsync(await launchFixture("body"));
  await mutate(zip);
  const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  try {
    const result = await processBytes(bytes, name);
    return result.ok ? { name, ok: false, error: "expected_refusal" } : { name, ok: true, refused: result.refused };
  } catch (error) {
    return { name, ok: true, refused: error instanceof Error ? error.message : "error" };
  }
}

const api = {
  networkAttempts,
  storageWrites,
  fixtures: LAUNCH_FIXTURES,
  async runFixture(kind: FixtureKind) {
    return processBytes(await fixtureBytes(kind), kind);
  },
  async runRefusals() {
    const eicar = await refuseCase("eicar", async (zip) => {
      zip.file("word/media/eicar.txt", EICAR_SIGNATURE);
    });
    const macro = await refuseCase("vba", (zip) => {
      zip.file("word/vbaProject.bin", "macro");
    });
    const entity = await refuseCase("xml_entity", async (zip) => {
      const xml = await zip.file("word/document.xml")!.async("string");
      zip.file("word/document.xml", xml.replace("<?xml version=\"1.0\"", "<!DOCTYPE w:document [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><?xml version=\"1.0\""));
    });
    return { eicar, macro, entity };
  },
  storageSnapshot() {
    return {
      localStorageKeys: storageKeys(localStorage),
      sessionStorageKeys: storageKeys(sessionStorage),
      networkAttempts: [...networkAttempts],
      storageWrites: [...storageWrites],
    };
  },
  lastOutputBase64() {
    return lastOutput ? bytesToBase64(lastOutput) : "";
  },
};

installNetworkTripwires();
installStorageTripwires();

(globalThis as typeof globalThis & { __agmtProofPrototype: typeof api }).__agmtProofPrototype = api;
