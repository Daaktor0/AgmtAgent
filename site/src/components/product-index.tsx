import { Link } from "@tanstack/react-router";
import { ExecuteMark } from "./brand";
import { ArrowRight } from "./icons";
import { PRODUCTS } from "@/lib/products";

/**
 * Agmt's products, set as a closing index: tab number, product, what it
 * produces, status. The last row keeps the next tab open.
 */
export function ProductIndex() {
  return (
    <div>
      <div className="hidden grid-cols-[4.5rem_minmax(0,1fr)_auto] border-b border-ink pb-3 md:grid">
        <span className="label">Tab</span>
        <span className="label">Product</span>
        <span className="label text-right">Status</span>
      </div>
      <ol>
        {PRODUCTS.map((product) => (
          <li key={product.slug} className="border-b border-line">
            <Link
              to={product.to}
              className="group grid grid-cols-[3rem_minmax(0,1fr)] gap-y-4 py-8 md:grid-cols-[4.5rem_minmax(0,1fr)_auto] md:items-start md:py-10"
            >
              <span className="font-mono text-[0.95rem] font-medium text-ink-3 md:pt-2">
                {String(product.tab).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-3">
                  <ExecuteMark size={34} className="text-ink" />
                  <span className="font-serif text-[2.4rem] leading-none tracking-[-0.03em] md:text-[3rem]">
                    {product.name}
                  </span>
                </span>
                <span className="mt-4 block max-w-[54ch] text-[1.05rem] text-ink-2">{product.line}</span>
                <span className="link-arrow mt-5 group-hover:text-blue">
                  See how it works <ArrowRight className="arrow" />
                </span>
              </span>
              <span className="col-start-2 md:col-start-auto md:pt-2 md:text-right">
                <span className="pill pill-execute">
                  <span className="pill-dot" /> {product.status}
                </span>
              </span>
            </Link>
          </li>
        ))}
        <li className="grid grid-cols-[3rem_minmax(0,1fr)] border-b border-line py-7 md:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
          <span className="font-mono text-[0.95rem] font-medium text-ink-3">
            {String(PRODUCTS.length + 1).padStart(2, "0")}
          </span>
          <span className="font-serif text-[1.3rem] italic text-ink-3">More products will follow.</span>
        </li>
      </ol>
    </div>
  );
}
