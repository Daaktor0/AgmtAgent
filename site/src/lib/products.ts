/**
 * The products index. Each Agmt product is one entry, listed in the order it
 * shipped, the way a closing index numbers its documents. Adding a product is
 * a new entry here plus its page under src/routes/products/.
 */
export type Product = {
  /** Tab number in the index. */
  tab: number;
  slug: string;
  name: string;
  /** One line: what it produces. */
  line: string;
  status: string;
  /** The product's own page on agmt.legal. */
  to: string;
  /** Where the product itself runs. */
  appUrl: string;
  cta: string;
};

export const PRODUCTS: Product[] = [
  {
    tab: 1,
    slug: "execute",
    name: "Execute",
    line: "Executed copies of multi-party agreements. Signature pages out, signed pages and stamp papers in, one complete copy for every party.",
    status: "Closed beta",
    to: "/products/execute",
    appUrl: "https://app.agmt.legal",
    cta: "Ask for access",
  },
];
