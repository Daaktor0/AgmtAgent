/**
 * Identifies the active Proofread attempt so a cancelled or replaced job cannot
 * publish a late result or object URL. This is not secure erasure of memory.
 */
export type ProofRunSession = {
  begin: () => string;
  invalidate: () => void;
  isActive: (token: string) => boolean;
};

export function createProofRunSession(): ProofRunSession {
  let active: string | null = null;
  return {
    begin() {
      const token = globalThis.crypto.randomUUID();
      active = token;
      return token;
    },
    invalidate() {
      active = null;
    },
    isActive(token: string) {
      return active === token;
    },
  };
}
