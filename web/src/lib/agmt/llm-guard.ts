/**
 * Proof makes zero language-model calls (SPEC §1.1, §5, §13.1).
 * Importing this module is the Proof path's closed client: any attempt to
 * record a provider call throws.
 */

export const PROOF_MAKES_NO_LLM_CALLS = true;

const LLM_HOST_RE =
  /openai\.com|anthropic\.com|openrouter\.ai|api\.x\.ai|googleapis\.com\/v1beta\/models|generativelanguage\.googleapis|api\.groq\.com|together\.xyz/i;

export function assertNoLlmCall(kind: string): never {
  throw new Error(
    `Proof must not call a language model (attempted: ${kind}).`,
  );
}

export function assertUrlIsNotLlm(url: string): void {
  if (LLM_HOST_RE.test(url)) {
    assertNoLlmCall(url);
  }
}

/** Tests monkey-patch this; Proof runners never increment it. */
export let proofLlmCallCount = 0;
