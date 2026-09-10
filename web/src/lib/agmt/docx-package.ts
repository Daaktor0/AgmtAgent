/**
 * Bounded OOXML package session.
 *
 * Inflates each ZIP entry once for CRC/size enforcement, retains XML/rels
 * text, and drops inflated binary parts. Unmodified local records are copied
 * as-is on rewrite so media is not recompressed.
 */
import { crc32, deflateRawSync } from "node:zlib";
import {
  inflateZipEntry,
  inspectZipCentralDirectory,
  verifyZipInflation,
  zipBytesView,
  zipLocalPayloadRange,
  ZIP_LIMITS,
  type ZipCentralDirectory,
  type ZipCentralEntry,
  type ZipLimitSet,
} from "./zip-safety.ts";

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;

export function isXmlPackagePart(name: string): boolean {
  return name === "[Content_Types].xml" || name.endsWith(".xml") || name.endsWith(".rels");
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function nextLocalOffset(directory: ZipCentralDirectory, entry: ZipCentralEntry): number {
  let next = directory.centralDirectoryOffset;
  for (const candidate of directory.entries) {
    if (candidate.localHeaderOffset > entry.localHeaderOffset && candidate.localHeaderOffset < next) {
      next = candidate.localHeaderOffset;
    }
  }
  return next;
}

export type OpenDocxPackageOptions = {
  limits?: ZipLimitSet;
  verify?: boolean;
  signal?: AbortSignal;
  onInflated?: (name: string, inflated: Uint8Array) => void;
};

export class DocxPackage {
  readonly source: Uint8Array;
  readonly directory: ZipCentralDirectory;
  readonly limits: ZipLimitSet;
  private readonly xmlCache = new Map<string, string>();
  private readonly byName = new Map<string, ZipCentralEntry>();

  private constructor(source: Uint8Array, directory: ZipCentralDirectory, limits: ZipLimitSet) {
    this.source = source;
    this.directory = directory;
    this.limits = limits;
    for (const entry of directory.entries) this.byName.set(entry.name, entry);
  }

  static open(bytes: Uint8Array, options: OpenDocxPackageOptions = {}): DocxPackage {
    const limits = options.limits ?? ZIP_LIMITS;
    const directory = inspectZipCentralDirectory(bytes, limits);
    const pkg = new DocxPackage(bytes, directory, limits);
    if (options.verify !== false) {
      verifyZipInflation(bytes, directory, (name, inflated) => {
        if (isXmlPackagePart(name)) {
          pkg.xmlCache.set(name, new TextDecoder("utf-8", { fatal: true }).decode(inflated));
        }
        options.onInflated?.(name, inflated);
      }, limits, options.signal);
    }
    return pkg;
  }

  names(): string[] {
    return this.directory.entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name);
  }

  has(name: string): boolean {
    const entry = this.byName.get(name);
    return Boolean(entry && !entry.isDirectory);
  }

  entry(name: string): ZipCentralEntry | undefined {
    return this.byName.get(name);
  }

  inflated(name: string): Uint8Array {
    const entry = this.byName.get(name);
    if (!entry || entry.isDirectory) throw new Error("missing_package_part");
    return inflateZipEntry(this.source, entry, this.directory, this.limits);
  }

  text(name: string): string {
    const cached = this.xmlCache.get(name);
    if (cached !== undefined) return cached;
    const inflated = this.inflated(name);
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(inflated);
    if (isXmlPackagePart(name)) this.xmlCache.set(name, xml);
    return xml;
  }

  localRecord(entry: ZipCentralEntry): Uint8Array {
    const end = nextLocalOffset(this.directory, entry);
    return this.source.subarray(entry.localHeaderOffset, end);
  }

  /**
   * Rebuild the ZIP. Unmodified local records are copied byte-for-byte.
   * `modified` values are uncompressed part bytes. Does not mutate `source`
   * or the XML cache; callers that need an independent original must open
   * from the original bytes, not from a shared session.
   */
  rewrite(modified: Map<string, Uint8Array>, options: { signal?: AbortSignal } = {}): Uint8Array {
    const throwIfAborted = (): void => {
      if (options.signal?.aborted) {
        const error = new Error("cancelled");
        error.name = "AbortError";
        throw error;
      }
    };
    throwIfAborted();
    const chunks: Uint8Array[] = [];
    let offset = 0;
    const written: Array<{
      flags: number;
      localHeaderOffset: number;
      compressionMethod: number;
      compressedSize: number;
      uncompressedSize: number;
      crc32: number;
      rawName: Uint8Array;
      extra: Uint8Array;
      comment: Uint8Array;
    }> = [];

    const originalOrder = [...this.directory.entries].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset);
    const seen = new Set<string>();

    const append = (chunk: Uint8Array): number => {
      const start = offset;
      chunks.push(chunk);
      offset += chunk.byteLength;
      if (offset > this.limits.MAX_OUTPUT_BYTES) throw new Error("output_too_large");
      return start;
    };

    const writeModified = (name: string, uncompressed: Uint8Array, previous?: ZipCentralEntry): void => {
      if (uncompressed.byteLength > this.limits.MAX_ENTRY_BYTES) throw new Error("package_entry_too_large");
      const rawName = previous?.rawName ?? new TextEncoder().encode(name);
      const crc = crc32(zipBytesView(uncompressed)) >>> 0;
      let method = 0;
      let compressed: Uint8Array = uncompressed;
      if (uncompressed.byteLength > 0) {
        const deflated = deflateRawSync(zipBytesView(uncompressed));
        const ratio = uncompressed.byteLength / Math.max(1, deflated.byteLength);
        if (deflated.byteLength < uncompressed.byteLength && ratio <= this.limits.MAX_COMPRESSION_RATIO) {
          method = 8;
          compressed = deflated;
        }
      }
      const local = new Uint8Array(30 + rawName.byteLength);
      const view = new DataView(local.buffer);
      writeU32(view, 0, LOCAL_SIGNATURE);
      writeU16(view, 4, 20);
      writeU16(view, 6, UTF8_FLAG);
      writeU16(view, 8, method);
      writeU16(view, 10, 0);
      writeU16(view, 12, 0);
      writeU32(view, 14, crc);
      writeU32(view, 18, compressed.byteLength);
      writeU32(view, 22, uncompressed.byteLength);
      writeU16(view, 26, rawName.byteLength);
      writeU16(view, 28, 0);
      local.set(rawName, 30);
      const localHeaderOffset = append(local);
      append(compressed);
      written.push({
        flags: UTF8_FLAG,
        localHeaderOffset,
        compressionMethod: method,
        compressedSize: compressed.byteLength,
        uncompressedSize: uncompressed.byteLength,
        crc32: crc,
        rawName,
        extra: new Uint8Array(0),
        comment: new Uint8Array(0),
      });
    };

    for (const entry of originalOrder) {
      throwIfAborted();
      seen.add(entry.name);
      const replacement = modified.get(entry.name);
      if (replacement) {
        writeModified(entry.name, replacement, entry);
        continue;
      }
      const record = this.localRecord(entry);
      const extra = this.source.subarray(
        entry.centralDirectoryRecordOffset + 46 + entry.rawName.byteLength,
        entry.centralDirectoryRecordOffset + 46 + entry.rawName.byteLength + entry.extraLength,
      );
      const comment = this.source.subarray(
        entry.centralDirectoryRecordOffset + 46 + entry.rawName.byteLength + entry.extraLength,
        entry.centralDirectoryRecordOffset + 46 + entry.rawName.byteLength + entry.extraLength + entry.commentLength,
      );
      written.push({
        flags: entry.flags,
        localHeaderOffset: append(record),
        compressionMethod: entry.compressionMethod,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
        crc32: entry.crc32,
        rawName: entry.rawName,
        extra,
        comment,
      });
    }

    for (const [name, uncompressed] of modified) {
      if (seen.has(name)) continue;
      writeModified(name, uncompressed);
    }

    const centralStart = offset;
    for (const item of written) {
      const header = new Uint8Array(46 + item.rawName.byteLength + item.extra.byteLength + item.comment.byteLength);
      const view = new DataView(header.buffer);
      writeU32(view, 0, CENTRAL_SIGNATURE);
      writeU16(view, 4, 20);
      writeU16(view, 6, 20);
      writeU16(view, 8, item.flags);
      writeU16(view, 10, item.compressionMethod);
      writeU16(view, 12, 0);
      writeU16(view, 14, 0);
      writeU32(view, 16, item.crc32);
      writeU32(view, 20, item.compressedSize);
      writeU32(view, 24, item.uncompressedSize);
      writeU16(view, 28, item.rawName.byteLength);
      writeU16(view, 30, item.extra.byteLength);
      writeU16(view, 32, item.comment.byteLength);
      writeU16(view, 34, 0);
      writeU16(view, 36, 0);
      writeU32(view, 38, 0);
      writeU32(view, 42, item.localHeaderOffset);
      header.set(item.rawName, 46);
      header.set(item.extra, 46 + item.rawName.byteLength);
      header.set(item.comment, 46 + item.rawName.byteLength + item.extra.byteLength);
      append(header);
    }

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    writeU32(eocdView, 0, EOCD_SIGNATURE);
    writeU16(eocdView, 4, 0);
    writeU16(eocdView, 6, 0);
    writeU16(eocdView, 8, written.length);
    writeU16(eocdView, 10, written.length);
    writeU32(eocdView, 12, offset - centralStart);
    writeU32(eocdView, 16, centralStart);
    writeU16(eocdView, 20, 0);
    append(eocd);
    return concatChunks(chunks, offset);
  }
}

export function uncompressedXmlBytes(directory: ZipCentralDirectory): { documentXml: number; totalXml: number } {
  let documentXml = 0;
  let totalXml = 0;
  for (const entry of directory.entries) {
    if (entry.isDirectory) continue;
    if (!isXmlPackagePart(entry.name)) continue;
    totalXml += entry.uncompressedSize;
    if (entry.name === "word/document.xml") documentXml = entry.uncompressedSize;
  }
  return { documentXml, totalXml };
}

export function zipPayloadEquals(
  left: DocxPackage,
  right: DocxPackage,
  name: string,
): boolean {
  const leftEntry = left.entry(name);
  const rightEntry = right.entry(name);
  if (!leftEntry || !rightEntry) return false;
  const leftRange = zipLocalPayloadRange(left.source, leftEntry, left.directory.centralDirectoryOffset);
  const rightRange = zipLocalPayloadRange(right.source, rightEntry, right.directory.centralDirectoryOffset);
  const leftBytes = left.source.subarray(leftRange.dataStart, leftRange.end);
  const rightBytes = right.source.subarray(rightRange.dataStart, rightRange.end);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  if (leftEntry.compressionMethod === rightEntry.compressionMethod && leftEntry.crc32 === rightEntry.crc32) {
    for (let index = 0; index < leftBytes.byteLength; index += 1) {
      if (leftBytes[index] !== rightBytes[index]) return false;
    }
    return true;
  }
  const leftInflated = left.inflated(name);
  const rightInflated = right.inflated(name);
  if (leftInflated.byteLength !== rightInflated.byteLength) return false;
  for (let index = 0; index < leftInflated.byteLength; index += 1) {
    if (leftInflated[index] !== rightInflated[index]) return false;
  }
  return true;
}
