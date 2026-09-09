/**
 * Open XML SDK validator contract (PWC-12).
 *
 * Production results are enums, counts and hashes only. Schema validation is
 * not Microsoft Word fidelity. There is no bypass environment flag.
 */
import { z } from "zod";

export const SDK_VALIDATOR_VERSION = "proof-sdk-validator-v1";
export const SDK_TARGET_OFFICE = "Office2016";
export const SDK_PACKAGE_ID = "DocumentFormat.OpenXml";
export const SDK_PACKAGE_VERSION = "3.5.1";
export const SDK_PACKAGE_LICENSE = "MIT";

export const SdkValidationCodeSchema = z.enum([
  "ok",
  "schema_errors",
  "invalid_package",
  "hash_mismatch",
  "unsupported_extension",
  "timeout",
  "runtime_unavailable",
]);
export type SdkValidationCode = z.infer<typeof SdkValidationCodeSchema>;

export const SdkValidationRequestSchema = z.strictObject({
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  outputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  target: z.literal(SDK_TARGET_OFFICE),
});
export type SdkValidationRequest = z.infer<typeof SdkValidationRequestSchema>;

export const SdkValidationResultSchema = z.strictObject({
  version: z.literal(SDK_VALIDATOR_VERSION),
  valid: z.boolean(),
  code: SdkValidationCodeSchema,
  errorCount: z.number().int().nonnegative().max(10_000),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  outputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  target: z.literal(SDK_TARGET_OFFICE),
});
export type SdkValidationResult = z.infer<typeof SdkValidationResultSchema>;

export class SdkValidationError extends Error {
  readonly code: SdkValidationCode;
  constructor(code: SdkValidationCode, message: string) {
    super(message);
    this.name = "SdkValidationError";
    this.code = code;
  }
}

export function parseSdkValidationResult(value: unknown): SdkValidationResult {
  const parsed = SdkValidationResultSchema.safeParse(value);
  if (!parsed.success) throw new SdkValidationError("invalid_package", "SDK validator result is not a closed contract");
  if (parsed.data.valid && parsed.data.code !== "ok") {
    throw new SdkValidationError(parsed.data.code, "valid results must use code ok");
  }
  if (!parsed.data.valid && parsed.data.code === "ok") {
    throw new SdkValidationError("schema_errors", "invalid results cannot use code ok");
  }
  return parsed.data;
}

export function sdkRuntimeUnavailable(request: SdkValidationRequest): SdkValidationResult {
  return {
    version: SDK_VALIDATOR_VERSION,
    valid: false,
    code: "runtime_unavailable",
    errorCount: 0,
    sourceSha256: request.sourceSha256,
    outputSha256: request.outputSha256,
    target: request.target,
  };
}
