import { executableProduct } from "../products/registry.ts";
import { exportProofDocx } from "../agmt/export/docx.ts";

/** Worker adapter: trusted supervisor supplies scanned bytes; result remains temporary content. */
const handlers = Object.freeze({ proof: exportProofDocx });
export function productHandler(productId: unknown, enabled: boolean) {
  const id = executableProduct(productId);
  if (!enabled) throw new Error("product_disabled");
  return handlers[id];
}
