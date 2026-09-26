/**
 * Synthetic capacity families. Never built from client documents.
 * Sizes are requested uncompressed-ish targets; callers must record actual
 * compressed and expanded sizes from the ZIP directory.
 */
import JSZip from "jszip";
import { launchFixture } from "./launch-fixtures.ts";

export const CAPACITY_FAMILIES = [
  "text_heavy",
  "image_heavy",
  "revisions",
  "tables",
  "adversarial",
] as const;

export type CapacityFamily = (typeof CAPACITY_FAMILIES)[number];

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const CLAUSE =
  "The Company has zero tolerance for bribery and corruption. Covered Persons must comply with all applicable anti-bribery and anti-corruption laws and must not, directly or indirectly, offer, promise, authorize, give, request, agree to receive or accept any bribe, kickback or other improper advantage in connection with Company business. ";

function incompressible(bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index += 1) out[index] = (index * 73 + 19) & 0xff;
  out[0] = 0x89;
  out[1] = 0x50;
  out[2] = 0x4e;
  out[3] = 0x47;
  return out;
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`;
}

export async function capacityFixture(family: CapacityFamily, targetBytes: number): Promise<Uint8Array> {
  if (targetBytes < 4 * 1024) throw new Error("capacity_fixture_too_small");
  const zip = await JSZip.loadAsync(await launchFixture("body"));
  if (family === "image_heavy") {
    const payload = incompressible(Math.max(8 * 1024, targetBytes - 8 * 1024));
    zip.file("word/media/image1.png", payload, { compression: "STORE", date: new Date(0), createFolders: false });
    const types = await zip.file("[Content_Types].xml")!.async("string");
    zip.file(
      "[Content_Types].xml",
      types.replace("</Types>", '<Override PartName="/word/media/image1.png" ContentType="image/png"/></Types>'),
      { date: new Date(0) },
    );
    return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  }

  const body: string[] = [];
  if (family === "text_heavy") {
    const unit = `${CLAUSE}The Company shall recieve the the notice under Clause 99.2 by [●]. `;
    while (body.join("").length < targetBytes) {
      const n = body.length;
      body.push(paragraph(`${unit}Ref ${n}-${(n * 7919) % 9973} amount ${(n * 37) % 1000}.${(n * 91) % 100}.`));
    }
  } else if (family === "revisions") {
    for (let index = 0; index < Math.max(8, Math.floor(targetBytes / 400)); index += 1) {
      body.push(
        `<w:p><w:ins w:id="${index * 2}" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z"><w:r><w:t>Added ${index}. </w:t></w:r></w:ins><w:del w:id="${index * 2 + 1}" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>Removed ${index}.</w:delText></w:r></w:del><w:r><w:t xml:space="preserve">${CLAUSE}</w:t></w:r></w:p>`,
      );
    }
  } else if (family === "tables") {
    const rows: string[] = [];
    const rowCount = Math.max(20, Math.floor(targetBytes / 250));
    for (let row = 0; row < rowCount; row += 1) {
      rows.push(
        `<w:tr><w:tc><w:p><w:r><w:t>Schedule ${row} recieve amount</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${CLAUSE.slice(0, 80)}</w:t></w:r></w:p></w:tc></w:tr>`,
      );
    }
    body.push(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows.join("")}</w:tbl>`);
  } else {
    body.push(paragraph(CLAUSE));
    const zeros = "a".repeat(Math.max(32 * 1024, Math.floor(targetBytes * 0.8)));
    zip.file("word/media/padding.bin", zeros, { compression: "DEFLATE", date: new Date(0), createFolders: false });
  }

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body.join("")}<w:sectPr/></w:body></w:document>`,
    { compression: "STORE", date: new Date(0) },
  );
  return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

export async function tinyCapacitySamples(): Promise<Record<CapacityFamily, Uint8Array>> {
  const out = {} as Record<CapacityFamily, Uint8Array>;
  for (const family of CAPACITY_FAMILIES) {
    out[family] = await capacityFixture(family, 24 * 1024);
  }
  return out;
}
