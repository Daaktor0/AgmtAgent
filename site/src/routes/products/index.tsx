import { createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/layout";
import { ProductIndex } from "@/components/product-index";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/products/")({
  head: () =>
    seo({
      title: "Products",
      description:
        "Agmt products each take one well-defined part of legal work and handle it end to end. Execute, the first, assembles executed copies of multi-party agreements.",
      path: "/products",
    }),
  component: Products,
});

function Products() {
  return (
    <>
      <PageIntro label="Products" title="One job each, done completely.">
        <p>
          Every Agmt product takes a single, well-defined part of legal work and handles it end to
          end, carefully enough that you can rely on the result. They're listed here the way a
          closing index lists its documents, and the list will grow.
        </p>
      </PageIntro>
      <section className="container-site pb-24 md:pb-32">
        <ProductIndex />
      </section>
    </>
  );
}
