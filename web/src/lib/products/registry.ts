import type { ProductId } from "./contracts.ts";

export type ProductDescriptor = Readonly<{
  id: ProductId; name: string; description: string; availability: "available" | "planned";
  route: string | null; inputKinds: readonly string[]; outputKinds: readonly string[];
  retentionPolicy: "temporary_2h" | "not_configured";
}>;
export const PRODUCTS: readonly ProductDescriptor[] = Object.freeze([
  { id: "proof", name: "Proof", description: "Proofread a Word agreement with tracked corrections and comments.", availability: "available", route: "/proof", inputKinds: ["docx"], outputKinds: ["docx"], retentionPolicy: "temporary_2h" },
  { id: "review", name: "Review", description: "Agreement review.", availability: "planned", route: null, inputKinds: [], outputKinds: [], retentionPolicy: "not_configured" },
  { id: "executed-copy", name: "Executed copy", description: "Compile executed agreement copies.", availability: "planned", route: null, inputKinds: [], outputKinds: [], retentionPolicy: "not_configured" },
  { id: "signature-pack", name: "Signature pack", description: "Prepare signature packs.", availability: "planned", route: null, inputKinds: [], outputKinds: [], retentionPolicy: "not_configured" },
]);

/** Availability is catalogue metadata, never authorization to issue a grant. */
export function executableProduct(value: unknown): "proof" {
  if (value !== "proof") throw new Error("product_unavailable");
  return value;
}

export function safeProofReturn(value: unknown): "/" | "/proof" {
  return value === "/proof" ? "/proof" : "/";
}
