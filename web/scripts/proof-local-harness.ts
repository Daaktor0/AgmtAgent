import { ensureBrowserBuffer } from "../src/lib/platform/buffer.ts";
import { launchFixture, LAUNCH_FIXTURES } from "../src/lib/agmt/corpus/launch-fixtures.ts";
import { admitLocalDocument, EICAR_SIGNATURE } from "../src/lib/proof-local/admit.ts";
import { installProofWorkerIsolation } from "../src/lib/proof-local/isolation.ts";
import { processProofLocal } from "../src/lib/proof-local/pipeline.ts";
import JSZip from "jszip";

ensureBrowserBuffer();
const isolation = installProofWorkerIsolation();

async function runFixture(kind: (typeof LAUNCH_FIXTURES)[number]) {
  const bytes = new Uint8Array(await launchFixture(kind));
  const started = performance.now();
  const result = await processProofLocal(bytes);
  const zip = await JSZip.loadAsync(result.output);
  const xml = await zip.file("word/document.xml")!.async("string");
  const commentsXml = await zip.file("word/comments.xml")?.async("string") ?? "";
  return {
    kind,
    ok: true,
    durationMs: Math.round(performance.now() - started),
    sourceBytes: result.sourceBytes,
    outputBytes: result.outputBytes,
    corrections: result.corrections,
    comments: result.comments,
    coverage: result.coverage,
    findings: result.findings,
    hasIns: /<w:ins\b/.test(xml),
    hasDel: /<w:del\b/.test(xml),
    hasCommentRange: /<w:commentRangeStart\b/.test(xml),
    authorAgmt: /w:author="Agmt Proof"/.test(xml) || /w:author="Agmt Proof"/.test(commentsXml),
    admit: result.admit,
    sdkInBrowser: result.sdkInBrowser,
    wordInBrowser: result.wordInBrowser,
    clamavInBrowser: result.clamavInBrowser,
    networkAttempts: [...isolation.networkAttempts],
    storageWrites: [...isolation.storageWrites],
    outputBase64: bytesToBase64(result.output),
    sourceBase64: bytesToBase64(bytes),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  if (bytes.byteLength > 1_500_000) return "";
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function refuse(name: string, edit: (zip: JSZip) => Promise<void> | void) {
  const zip = await JSZip.loadAsync(await launchFixture("body"));
  await edit(zip);
  const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  try {
    admitLocalDocument(bytes);
    return { name, ok: false, error: "expected_refusal" };
  } catch (error) {
    return { name, ok: true, refused: error instanceof Error ? error.message : "error" };
  }
}

const api = {
  fixtures: LAUNCH_FIXTURES,
  isolation,
  async runAll() {
    const fixtures: Record<string, unknown> = {};
    for (const kind of LAUNCH_FIXTURES) fixtures[kind] = await runFixture(kind);
    const refusals = {
      eicar: await refuse("eicar", (zip) => { zip.file("word/media/eicar.txt", EICAR_SIGNATURE); }),
      macro: await refuse("vba", (zip) => { zip.file("word/vbaProject.bin", "macro"); }),
      entity: await refuse("xml_entity", async (zip) => {
        const xml = await zip.file("word/document.xml")!.async("string");
        zip.file("word/document.xml", xml.replace("<?xml version=\"1.0\"", "<!DOCTYPE w:document [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><?xml version=\"1.0\""));
      }),
    };
    return { fixtures, refusals, isolation };
  },
};

(globalThis as typeof globalThis & { __agmtProofLocal: typeof api }).__agmtProofLocal = api;
