export const ZIP_LIMITS = {
  MAX_ENTRIES: 4096,
  MAX_EXPANDED_BYTES: 150 * 1024 * 1024,
  MAX_ENTRY_BYTES: 32 * 1024 * 1024,
  MAX_COMPRESSION_RATIO: 250,
  MAX_CENTRAL_DIRECTORY_BYTES: 4 * 1024 * 1024,
  MAX_ENTRY_NAME_BYTES: 1024,
  MAX_ENTRY_COMMENT_BYTES: 1024,
} as const;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const ENCRYPTED_FLAG = 0x0001;
const UTF8_FLAG = 0x0800;
const ZIP64_SENTINEL = 0xffffffff;

export class ZipSafetyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ZipSafetyError";
    this.code = code;
  }
}

function reject(code: string, message: string): never {
  throw new ZipSafetyError(code, message);
}

function readU16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) {
    reject("zip_central_directory_invalid", "ZIP field is outside the archive");
  }
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) {
    reject("zip_central_directory_invalid", "ZIP field is outside the archive");
  }
  return view.getUint32(offset, true);
}

function hasSignature(view: DataView, offset: number, signature: number): boolean {
  return offset >= 0 && offset + 4 <= view.byteLength && readU32(view, offset) === signature;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function decodeName(raw: Uint8Array, flags: number): string {
  if ((flags & UTF8_FLAG) === 0 && raw.some((value) => value > 0x7f)) {
    reject("ambiguous_filename_encoding", "Non-UTF-8 ZIP filenames are not supported");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    reject("invalid_filename_encoding", "ZIP filename is not valid UTF-8");
  }
}

function validateName(name: string): void {
  if (
    name.length === 0 ||
    name.length > ZIP_LIMITS.MAX_ENTRY_NAME_BYTES ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    name.includes("\\") ||
    name.startsWith("/") ||
    name.startsWith("//") ||
    /^[A-Za-z]:[\\/]/.test(name)
  ) {
    reject("unsafe_package_path", "ZIP entry path is not safe");
  }

  const segments = name.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const isTrailingDirectorySegment = index === segments.length - 1 && segment === "" && name.endsWith("/");
    if (segment === ".." || segment === "." || (segment === "" && !isTrailingDirectorySegment)) {
      reject("unsafe_package_path", "ZIP entry path is not safe");
    }
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (!hasSignature(view, offset, END_OF_CENTRAL_DIRECTORY)) continue;
    const commentLength = readU16(view, offset + 20);
    if (offset + 22 + commentLength === view.byteLength) return offset;
  }
  reject("zip_central_directory_invalid", "ZIP end-of-central-directory record is invalid");
}

function validateLocalEntry(
  view: DataView,
  bytes: Uint8Array,
  entry: {
    name: string;
    rawName: Uint8Array;
    flags: number;
    compressionMethod: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
  },
  centralDirectoryOffset: number,
): { start: number; end: number } {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > centralDirectoryOffset || !hasSignature(view, offset, LOCAL_FILE_HEADER)) {
    reject("zip_local_header_invalid", "ZIP local file header is invalid");
  }

  const localFlags = readU16(view, offset + 6);
  const localMethod = readU16(view, offset + 8);
  if (localFlags !== entry.flags || localMethod !== entry.compressionMethod) {
    reject("zip_local_header_mismatch", "ZIP local and central headers disagree");
  }

  const localNameLength = readU16(view, offset + 26);
  const localExtraLength = readU16(view, offset + 28);
  const dataStart = offset + 30 + localNameLength + localExtraLength;
  if (dataStart > centralDirectoryOffset) {
    reject("zip_local_header_invalid", "ZIP local header exceeds the file data area");
  }

  const localName = bytes.subarray(offset + 30, offset + 30 + localNameLength);
  if (!equalBytes(localName, entry.rawName)) {
    reject("zip_local_header_mismatch", "ZIP local and central filenames disagree");
  }

  if ((entry.flags & DATA_DESCRIPTOR_FLAG) === 0) {
    if (
      readU32(view, offset + 18) !== entry.compressedSize ||
      readU32(view, offset + 22) !== entry.uncompressedSize
    ) {
      reject("zip_local_header_mismatch", "ZIP local and central sizes disagree");
    }
  }

  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd < dataStart || dataEnd > centralDirectoryOffset) {
    reject("zip_entry_out_of_bounds", "ZIP entry data exceeds the central directory boundary");
  }
  return { start: offset, end: dataEnd };
}

export type ZipCentralEntry = {
  name: string;
  flags: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  isDirectory: boolean;
};

export type ZipCentralDirectory = {
  entries: ZipCentralEntry[];
  compressedBytes: number;
  expandedBytes: number;
  endOfCentralDirectoryOffset: number;
  centralDirectoryOffset: number;
  centralDirectorySize: number;
};

export function inspectZipCentralDirectory(bytes: Uint8Array): ZipCentralDirectory {
  if (bytes.byteLength < 22) {
    reject("zip_central_directory_invalid", "ZIP archive is too small");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(view);
  const diskNumber = readU16(view, endOfCentralDirectoryOffset + 4);
  const centralDirectoryDisk = readU16(view, endOfCentralDirectoryOffset + 6);
  const entriesOnDisk = readU16(view, endOfCentralDirectoryOffset + 8);
  const entryCount = readU16(view, endOfCentralDirectoryOffset + 10);
  const centralDirectorySize = readU32(view, endOfCentralDirectoryOffset + 12);
  const centralDirectoryOffset = readU32(view, endOfCentralDirectoryOffset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    reject("zip_multidisk_unsupported", "Multi-disk ZIP archives are not supported");
  }
  if (
    entryCount === 0xffff ||
    centralDirectorySize === ZIP64_SENTINEL ||
    centralDirectoryOffset === ZIP64_SENTINEL
  ) {
    reject("zip64_unsupported", "ZIP64 archives are not supported by the bounded parser");
  }
  if (entryCount > ZIP_LIMITS.MAX_ENTRIES) {
    reject("package_too_complex", "ZIP entry count exceeds the bounded parser limit");
  }
  if (centralDirectorySize > ZIP_LIMITS.MAX_CENTRAL_DIRECTORY_BYTES) {
    reject("package_too_complex", "ZIP central directory exceeds the bounded parser limit");
  }
  if (
    centralDirectoryOffset < 0 ||
    centralDirectoryOffset + centralDirectorySize !== endOfCentralDirectoryOffset ||
    centralDirectoryOffset + centralDirectorySize > bytes.byteLength
  ) {
    reject("zip_central_directory_invalid", "ZIP central directory bounds are invalid");
  }

  const entries: ZipCentralEntry[] = [];
  const seenNames = new Set<string>();
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = centralDirectoryOffset;
  let compressedBytes = 0;
  let expandedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOfCentralDirectoryOffset || !hasSignature(view, cursor, CENTRAL_DIRECTORY_ENTRY)) {
      reject("zip_central_directory_invalid", "ZIP central directory entry is invalid");
    }

    const versionMadeBy = readU16(view, cursor + 4);
    const flags = readU16(view, cursor + 8);
    const compressionMethod = readU16(view, cursor + 10);
    const compressedSize = readU32(view, cursor + 20);
    const uncompressedSize = readU32(view, cursor + 24);
    const nameLength = readU16(view, cursor + 28);
    const extraLength = readU16(view, cursor + 30);
    const commentLength = readU16(view, cursor + 32);
    const diskStart = readU16(view, cursor + 34);
    const externalAttributes = readU32(view, cursor + 38);
    const localHeaderOffset = readU32(view, cursor + 42);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;

    if (
      compressedSize === ZIP64_SENTINEL ||
      uncompressedSize === ZIP64_SENTINEL ||
      localHeaderOffset === ZIP64_SENTINEL
    ) {
      reject("zip64_unsupported", "ZIP64 entry metadata is not supported by the bounded parser");
    }
    if (
      nameLength === 0 ||
      nameLength > ZIP_LIMITS.MAX_ENTRY_NAME_BYTES ||
      commentLength > ZIP_LIMITS.MAX_ENTRY_COMMENT_BYTES ||
      recordEnd > endOfCentralDirectoryOffset
    ) {
      reject("zip_central_directory_invalid", "ZIP entry metadata exceeds the bounded parser limit");
    }
    if ((flags & ENCRYPTED_FLAG) !== 0) {
      reject("zip_encrypted_entry", "Encrypted ZIP entries are not supported");
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      reject("unsupported_compression", "ZIP compression method is not supported");
    }
    if (diskStart !== 0) {
      reject("zip_multidisk_unsupported", "ZIP entry is assigned to another disk");
    }

    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decodeName(rawName, flags);
    validateName(name);
    if (seenNames.has(name)) {
      reject("duplicate_package_path", "ZIP contains duplicate entry paths");
    }
    seenNames.add(name);

    const unixMode = (externalAttributes >>> 16) & 0xffff;
    if (((versionMadeBy >>> 8) & 0xff) === 3 && (unixMode & 0xf000) === 0xa000) {
      reject("unsupported_package_link", "ZIP symbolic links are not supported");
    }

    if (uncompressedSize > ZIP_LIMITS.MAX_ENTRY_BYTES) {
      reject("package_entry_too_large", "ZIP entry exceeds the bounded extraction limit");
    }
    expandedBytes += uncompressedSize;
    compressedBytes += compressedSize;
    if (
      expandedBytes > ZIP_LIMITS.MAX_EXPANDED_BYTES ||
      compressedBytes > bytes.byteLength ||
      !Number.isSafeInteger(expandedBytes) ||
      !Number.isSafeInteger(compressedBytes)
    ) {
      reject("package_expanded_too_large", "ZIP package exceeds the bounded expansion limit");
    }
    if (uncompressedSize > 0 && compressedSize === 0) {
      reject("suspicious_compression_ratio", "ZIP entry has no compressed bytes");
    }
    if (
      compressedSize > 0 &&
      uncompressedSize / compressedSize > ZIP_LIMITS.MAX_COMPRESSION_RATIO
    ) {
      reject("suspicious_compression_ratio", "ZIP entry compression ratio is too high");
    }

    const range = validateLocalEntry(
      view,
      bytes,
      {
        name,
        rawName,
        flags,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      },
      centralDirectoryOffset,
    );
    ranges.push(range);
    entries.push({
      name,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      isDirectory: name.endsWith("/"),
    });
    cursor = recordEnd;
  }

  if (cursor !== endOfCentralDirectoryOffset) {
    reject("zip_central_directory_invalid", "ZIP central directory has trailing records");
  }

  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (previous.end > current.start) {
      reject("zip_entry_overlap", "ZIP local entries overlap");
    }
  }

  return {
    entries,
    compressedBytes,
    expandedBytes,
    endOfCentralDirectoryOffset,
    centralDirectoryOffset,
    centralDirectorySize,
  };
};
