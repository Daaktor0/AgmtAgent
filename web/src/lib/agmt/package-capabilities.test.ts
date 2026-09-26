import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import JSZip from "jszip";
import { extractDocx } from "./docx-v2.ts";
import {
  NS,
  PACKAGE_CAPABILITY_INVENTORY_VERSION,
  PackageCapabilityError,
  SUPPORTED_PROFILE_ID,
  assertOriginalBytesUntouched,
  inventoryPackageCapabilities,
} from "./package-capabilities.ts";

const WML = NS.WML;
const RELS = NS.PKG_RELS;
const TYPES = NS.PKG_TYPES;
const OFFICE_RELS = NS.OFFICE_RELS;
const MC = NS.MC;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function p(text: string, prefix = "w"): string {
  return `<${prefix}:p><${prefix}:r><${prefix}:t xml:space="preserve">${text}</${prefix}:t></${prefix}:r></${prefix}:p>`;
}

async function packageOf(parts: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(parts)) {
    zip.file(name, data, { date: new Date(0), createFolders: false });
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "STORE" }));
}

function typesXml(overrides: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${TYPES}">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${overrides}
</Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
  <Relationship Id="rId1" Type="${OFFICE_RELS}/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function documentXml(body: string, xmlns = `xmlns:w="${WML}"`): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${xmlns}><w:body>${body}<w:sectPr/></w:body></w:document>`;
}

async function ordinaryDocx(body = p("The Company shall deliver notice.")): Promise<Buffer> {
  return packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(body),
  });
}

test("PWC-05 ordinary body package is a supported Phase A profile", async () => {
  const bytes = await ordinaryDocx();
  const receipt = await inventoryPackageCapabilities(bytes);
  assert.equal(receipt.version, PACKAGE_CAPABILITY_INVENTORY_VERSION);
  assert.equal(receipt.profileId, SUPPORTED_PROFILE_ID);
  assert.equal(receipt.disposition, "supported");
  assert.equal(receipt.refusedReason, null);
  const document = receipt.parts.find((part) => part.partUri === "/word/document.xml");
  assert.ok(document);
  assert.equal(document.preserve, "full");
  assert.equal(document.read, "full");
  assert.equal(document.edit, "surgical");
  assert.equal(document.disposition, "supported");
  assert.equal(receipt.packageSha256, sha256(bytes));
});

test("PWC-05 WML prefix alias is still Word markup; w prefix spoof is refused", async () => {
  const aliased = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<wp:document xmlns:wp="${WML}"><wp:body>${p("Aliased prefix still maps by URI.", "wp")}<wp:sectPr/></wp:body></wp:document>`,
  });
  const aliasedReceipt = await inventoryPackageCapabilities(aliased);
  assert.equal(aliasedReceipt.disposition, "supported");
  assert.equal(aliasedReceipt.namespaces.some((binding) => binding.aliasOfWml), true);

  const spoofed = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://example.test/not-word"><w:body>${p("Looks like Word but is not.")}<w:sectPr/></w:body></w:document>`,
  });
  const spoofedReceipt = await inventoryPackageCapabilities(spoofed);
  assert.equal(spoofedReceipt.disposition, "refused");
  assert.equal(spoofedReceipt.refusedReason, "namespace_spoof");
  assert.equal(spoofedReceipt.namespaces.some((binding) => binding.spoofOfW), true);
});

test("PWC-05 absent relationship source or target is not treated as coverage", async () => {
  const missingTarget = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(p("Body")),
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
  <Relationship Id="rIdMissing" Type="${OFFICE_RELS}/header" Target="header1.xml"/>
</Relationships>`,
  });
  await assert.rejects(
    () => inventoryPackageCapabilities(missingTarget),
    (error: unknown) => error instanceof PackageCapabilityError && error.code === "missing_relationship_target",
  );

  const missingSource = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(p("Body")),
    "word/_rels/missing.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
  <Relationship Id="rId1" Type="${OFFICE_RELS}/styles" Target="styles.xml"/>
</Relationships>`,
  });
  await assert.rejects(
    () => inventoryPackageCapabilities(missingSource),
    (error: unknown) => error instanceof PackageCapabilityError && error.code === "missing_relationship_source",
  );
});

test("PWC-05 modern comments, protection, customXml and attached templates are refused", async () => {
  const modern = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(p("Body")),
    "word/commentsExtended.xml": `<?xml version="1.0" encoding="UTF-8"?><w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>`,
  });
  const modernReceipt = await inventoryPackageCapabilities(modern);
  assert.equal(modernReceipt.disposition, "refused");
  assert.equal(modernReceipt.refusedReason, "modern_comments");

  const protectedDoc = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(p("Body")),
    "word/settings.xml": `<?xml version="1.0" encoding="UTF-8"?><w:settings xmlns:w="${WML}"><w:documentProtection w:enforcement="1"/></w:settings>`,
  });
  const protectedReceipt = await inventoryPackageCapabilities(protectedDoc);
  assert.equal(protectedReceipt.disposition, "refused");
  assert.equal(protectedReceipt.refusedReason, "protected_document");

  const customXml = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/customXml/item1.xml" ContentType="application/xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(p("Body")),
    "customXml/item1.xml": `<?xml version="1.0" encoding="UTF-8"?><item/>`,
  });
  const customReceipt = await inventoryPackageCapabilities(customXml);
  assert.equal(customReceipt.disposition, "refused");
  assert.equal(customReceipt.refusedReason, "custom_xml");

  const template = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
  <Relationship Id="rId1" Type="${OFFICE_RELS}/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rIdTemplate" Type="${OFFICE_RELS}/attachedTemplate" Target="https://example.test/template.dotx" TargetMode="External"/>
</Relationships>`,
    "word/document.xml": documentXml(p("Body")),
  });
  const templateReceipt = await inventoryPackageCapabilities(template);
  assert.equal(templateReceipt.disposition, "refused");
  assert.equal(templateReceipt.refusedReason, "external_template");
});

test("PWC-05 passive http hyperlinks are limited and never fetched", async () => {
  const bytes = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(p("See the site.")),
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELS}">
  <Relationship Id="rIdH" Type="${OFFICE_RELS}/hyperlink" Target="https://example.test/doc" TargetMode="External"/>
</Relationships>`,
  });
  const receipt = await inventoryPackageCapabilities(bytes);
  assert.equal(receipt.disposition, "limited");
  const hyperlink = receipt.relationships.find((rel) => rel.id === "rIdH");
  assert.ok(hyperlink);
  assert.equal(hyperlink.disposition, "limited");
  assert.equal(hyperlink.unsupportedReason, "passive_hyperlink");
  assert.equal(hyperlink.edit, "none");
  assert.equal(receipt.coverageReasons.includes("passive_hyperlink"), true);
});

test("PWC-05 AlternateContent is limited, empty body and main content-type mismatch are refused", async () => {
  const alternate = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WML}" xmlns:mc="${MC}">
  <w:body>
    <mc:AlternateContent>
      <mc:Choice Requires="wps">${p("Choice text")}</mc:Choice>
      <mc:Fallback>${p("Fallback text")}</mc:Fallback>
    </mc:AlternateContent>
    <w:sectPr/>
  </w:body>
</w:document>`,
  });
  const alternateReceipt = await inventoryPackageCapabilities(alternate);
  assert.equal(alternateReceipt.disposition, "limited");
  assert.equal(alternateReceipt.coverageReasons.includes("alternate_content"), true);
  const document = alternateReceipt.parts.find((part) => part.partUri === "/word/document.xml");
  assert.equal(document?.read, "none");
  assert.equal(document?.edit, "none");

  const empty = await ordinaryDocx("");
  const emptyReceipt = await inventoryPackageCapabilities(empty);
  assert.equal(emptyReceipt.disposition, "refused");
  assert.equal(emptyReceipt.refusedReason, "unsupported_empty_body");

  const mismatch = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(p("Body")),
  });
  const mismatchReceipt = await inventoryPackageCapabilities(mismatch);
  assert.equal(mismatchReceipt.disposition, "refused");
  assert.equal(mismatchReceipt.refusedReason, "content_type_mismatch");
});

test("PWC-05 unknown parts stay unknown; original bytes are unchanged and not stripped", async () => {
  const bytes = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(p("Body")),
    "word/mystery.xml": `<?xml version="1.0" encoding="UTF-8"?><unknown xmlns="http://example.test/mystery"><x>keep</x></unknown>`,
  });
  const original = Buffer.from(bytes);
  const receipt = await inventoryPackageCapabilities(bytes);
  assertOriginalBytesUntouched(original, bytes);
  assert.equal(receipt.disposition, "limited");
  const mystery = receipt.parts.find((part) => part.partUri === "/word/mystery.xml");
  assert.ok(mystery);
  assert.equal(mystery.disposition, "unknown");
  assert.equal(mystery.preserve, "opaque");
  assert.equal(mystery.read, "none");
  assert.equal(mystery.edit, "none");
  assert.equal(mystery.unsupportedReason, "unknown_part");
  assert.equal(receipt.coverageReasons.includes("unknown_part"), true);

  const extracted = await extractDocx(bytes);
  assert.equal(extracted.packageCapabilityReceipt?.disposition, "limited");
  assert.equal(extracted.packageCapabilityReceipt?.parts.find((part) => part.partUri === "/word/mystery.xml")?.sha256, mystery.sha256);
  assert.equal(extracted.packageCapabilityReceipt?.receiptHash, receipt.receiptHash);
  assertOriginalBytesUntouched(original, bytes);
});

test("PWC-05 extractDocx refuses unsupported packages instead of stripping them", async () => {
  const customXml = await packageOf({
    "[Content_Types].xml": typesXml(
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/customXml/item1.xml" ContentType="application/xml"/>',
    ),
    "_rels/.rels": rootRels(),
    "word/document.xml": documentXml(p("Body")),
    "customXml/item1.xml": `<?xml version="1.0" encoding="UTF-8"?><item/>`,
  });
  await assert.rejects(
    () => extractDocx(customXml),
    (error: unknown) => error instanceof Error && (error as { code?: string }).code === "custom_xml",
  );
  assert.match(customXml.toString("utf8"), /customXml\/item1\.xml/);
});
