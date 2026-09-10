import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { launchFixture } from "../agmt/corpus/launch-fixtures.ts";
import { admitLocalDocument, EICAR_SIGNATURE } from "./admit.ts";
import { PROOF_LOCAL_POLICY_DESKTOP } from "./policy.ts";

async function mutate(edit: (zip: JSZip) => Promise<void> | void): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(await launchFixture("body"));
  await edit(zip);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

test("local admit accepts a supported synthetic and never claims ClamAV", async () => {
    const bytes = new Uint8Array(await launchFixture("body"));
    const receipt = admitLocalDocument(bytes);
    assert.equal(receipt.status, "structurally_admitted");
    assert.equal(receipt.clamav, "cannot_run_in_browser");
    assert.equal(receipt.reason, "local_zip_xml_active_content_and_eicar_only");
});

test("local admit refuses EICAR, macros, XML entities, and oversized sources", async () => {
    await assert.rejects(async () => admitLocalDocument(await mutate((zip) => {
      zip.file("word/media/eicar.txt", EICAR_SIGNATURE);
    })), /unsafe_docx/);
    await assert.rejects(async () => admitLocalDocument(await mutate((zip) => {
      zip.file("word/vbaProject.bin", "macro");
    })), /active_content_not_supported|unsupported_docx_package|invalid_docx_zip/);
    await assert.rejects(async () => admitLocalDocument(await mutate(async (zip) => {
      const xml = await zip.file("word/document.xml")!.async("string");
      zip.file("word/document.xml", xml.replace("<?xml version=\"1.0\"", "<!DOCTYPE w:document [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><?xml version=\"1.0\""));
    })), /external_content_not_supported|invalid_docx_zip/);
    const huge = new Uint8Array([0x50, 0x4b, 0, 0]);
    assert.throws(
      () => admitLocalDocument(huge, { policy: { ...PROOF_LOCAL_POLICY_DESKTOP, maxSourceBytes: 3 } }),
      /source_too_large/,
    );
});
