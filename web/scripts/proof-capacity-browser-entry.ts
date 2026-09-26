import { ensureBrowserBuffer } from "../src/lib/platform/buffer.ts";
import { capacityFixture } from "../src/lib/agmt/corpus/capacity-fixtures.ts";
import {
  completeAgreementFixture,
  packageCapacitySnapshot,
  type AgreementKind,
  type AgreementPageTarget,
} from "../src/lib/agmt/corpus/agreement-fixtures.ts";
import { processProofLocal } from "../src/lib/proof-local/pipeline.ts";
import { PROOF_LOCAL_POLICY_DESKTOP, PROOF_LOCAL_POLICY_LAB } from "../src/lib/proof-local/policy.ts";

ensureBrowserBuffer();

(globalThis as typeof globalThis & {
  __agmtCapacity: {
    runImageHeavy: (targetBytes: number) => Promise<{
      outcome: string;
      compressedBytes: number;
      outputBytes: number;
      corrections: number;
      comments: number;
    }>;
    runAgreement: (pages: AgreementPageTarget, kind: AgreementKind) => Promise<Record<string, unknown>>;
    selectDesktop: () => string;
  };
}).__agmtCapacity = {
  async runImageHeavy(targetBytes: number) {
    const source = await capacityFixture("image_heavy", targetBytes);
    try {
      const result = await processProofLocal(source, { policy: PROOF_LOCAL_POLICY_LAB });
      return {
        outcome: "ok",
        compressedBytes: source.byteLength,
        outputBytes: result.outputBytes,
        corrections: result.corrections,
        comments: result.comments,
      };
    } catch (error) {
      return {
        outcome: error instanceof Error ? error.message : "error",
        compressedBytes: source.byteLength,
        outputBytes: 0,
        corrections: 0,
        comments: 0,
        name: error instanceof Error ? error.name : "Error",
      };
    }
  },
  async runAgreement(pages, kind) {
    const fixture = await completeAgreementFixture(pages, kind);
    const snap = packageCapacitySnapshot(fixture.bytes, PROOF_LOCAL_POLICY_DESKTOP);
    try {
      const result = await processProofLocal(fixture.bytes, { policy: PROOF_LOCAL_POLICY_DESKTOP });
      return {
        outcome: "ok",
        ...snap,
        outputBytes: result.outputBytes,
        corrections: result.corrections,
        comments: result.comments,
        coverage: result.coverage,
        findings: result.findings.map((finding) => `${finding.ruleId}:${finding.quote}`),
      };
    } catch (error) {
      return {
        outcome: error instanceof Error ? error.message : "error",
        ...snap,
        outputBytes: 0,
        corrections: 0,
        comments: 0,
      };
    }
  },
  selectDesktop() {
    return PROOF_LOCAL_POLICY_DESKTOP.class;
  },
};
