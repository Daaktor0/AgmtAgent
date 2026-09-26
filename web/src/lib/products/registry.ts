import type { ProductId } from "./contracts.ts";

export type ProductDescriptor = Readonly<{
  id: ProductId; name: string; description: string; availability: "available" | "planned";
  route: string | null; inputKinds: readonly string[]; outputKinds: readonly string[];
  /** on_device: processed and kept only in the user's browser; never stored by Agmt. */
  retentionPolicy: "temporary_2h" | "on_device" | "not_configured";
}>;
export const PRODUCTS: readonly ProductDescriptor[] = Object.freeze([
  { id: "proof", name: "Proof", description: "Proofread a Word agreement with tracked corrections and comments.", availability: "available", route: "/proof", inputKinds: ["docx"], outputKinds: ["docx"], retentionPolicy: "temporary_2h" },
  { id: "review", name: "Review", description: "Agreement review.", availability: "planned", route: null, inputKinds: [], outputKinds: [], retentionPolicy: "not_configured" },
  { id: "executed-copy", name: "Executed copies", description: "Assemble executed copies of multi-party agreements on the user's device.", availability: "available", route: "/", inputKinds: ["pdf", "image"], outputKinds: ["pdf", "zip"], retentionPolicy: "on_device" },
  { id: "signature-pack", name: "Signature pack", description: "Prepare signature packs.", availability: "planned", route: null, inputKinds: [], outputKinds: [], retentionPolicy: "not_configured" },
]);

/** Availability is catalogue metadata, never authorization to issue a grant. */
export function executableProduct(value: unknown): "proof" {
  if (value !== "proof") throw new Error("product_unavailable");
  return value;
}

export type ProofReturnPath = "/" | "/proof" | `/proof?run=${string}`;

export function safeProofReturn(value: unknown): ProofReturnPath {
  if (value === "/proof") return "/proof";
  if (typeof value === "string") {
    const match = value.match(/^\/proof\?run=([A-Za-z0-9_-]{16,64})$/);
    if (match) return value as `/proof?run=${string}`;
  }
  return "/";
}
