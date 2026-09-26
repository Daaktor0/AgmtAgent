import { createFileRoute, Link } from "@tanstack/react-router";
import { ClosingSet } from "@/components/closing-set";
import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { Screenshot } from "@/components/media";
import { PostGrid } from "@/components/posts";
import { ProductIndex } from "@/components/product-index";
import { fetchPosts } from "@/lib/blog";
import { seo } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/")({
  loader: () => fetchPosts(),
  head: () =>
    seo({
      description: SITE.description,
      path: "/",
    }),
  component: Home,
});

const EXECUTE_POINTS = [
  {
    title: "Signature pages, three ways",
    body: "Found in the agreement, made from the parties clause, or built from your own template.",
  },
  {
    title: "Every return, sorted",
    body: "Scans, phone photos and PDFs are read on your computer and matched to the right party and page.",
  },
  {
    title: "Caught before you send",
    body: "A missing page, a stamp paper in the wrong name, a certificate used twice. Flagged, with the reason.",
  },
];

const PRINCIPLES = [
  {
    label: "Your documents",
    title: "They never leave your computer.",
    body: "Execute runs entirely in your browser. Agreements, signed pages and stamp papers are read, sorted and assembled on your machine. No document, file name or page text is sent to Agmt.",
  },
  {
    label: "Our method",
    title: "Rules you can check.",
    body: "No AI model guesses at your documents. Execute works from explicit rules and on-device text recognition, so every match has a reason and every flag can be explained.",
  },
  {
    label: "Your output",
    title: "No fingerprints on your work.",
    body: "Signature pages Execute makes carry no Agmt name or mark, visible or hidden in the file. What goes to the other side looks like it came from your firm.",
  },
];

function Home() {
  const { posts } = Route.useLoaderData();

  return (
    <>
      {/* Opening */}
      <section className="container-site grid items-center gap-14 pt-12 pb-20 md:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 lg:pb-28">
        <div>
          <p className="label reveal">Legal products</p>
          <h1 className="display-1 reveal reveal-2 mt-6 max-w-[11ch]">Legal work, down to the last page.</h1>
          <p className="lead reveal reveal-3 mt-8 max-w-[46ch]">
            Agmt builds software for the exacting side of legal practice: the procedural work that
            has to be perfect and still takes whole evenings. We're starting where every deal ends.
          </p>
          <div className="reveal reveal-4 mt-10 flex flex-wrap gap-3">
            <Link to="/products/execute" className="btn btn-primary">
              Meet Execute <ArrowRight className="arrow" />
            </Link>
            <Link to="/blog" className="btn btn-ghost">
              Read the blog
            </Link>
          </div>
        </div>
        <ClosingSet className="lg:ml-auto" />
      </section>

      {/* Execute */}
      <section className="border-y border-line bg-bg-2">
        <div className="container-site py-20 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
            <div className="flex flex-col">
              <p className="label">Our first product</p>
              <h2 className="display-2 mt-5 max-w-[13ch]">Signature pages out. Executed copies back.</h2>
              <p className="lead mt-7 max-w-[48ch]">
                A signing sends pages to every party and gets them back over days, as scans, phone
                photos and PDFs, some with stamp papers and some without. Execute keeps track of all
                of it and assembles one complete executed copy for every party, with a closing index.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/products/execute" className="btn btn-primary">
                  See how Execute works <ArrowRight className="arrow" />
                </Link>
                <a href={SITE.appUrl} className="btn btn-ghost">
                  Ask for access <ArrowUpRight className="arrow arrow-up" />
                </a>
              </div>
            </div>
            <Screenshot
              src="/products/execute/returns.webp"
              width={1360}
              height={1058}
              alt="Execute's returns screen for a sample signing: a file it couldn't place waiting for a decision, and a checklist of seven parties across two agreements showing which signed pages and stamp papers are in, awaited, or need fixing."
              caption="The returns checklist in Execute's built-in sample. The parties are fictional."
            />
          </div>
          <div className="mt-16 grid gap-10 border-t border-line pt-10 md:grid-cols-3 md:gap-8">
            {EXECUTE_POINTS.map((point) => (
              <div key={point.title}>
                <h3 className="title-3">{point.title}</h3>
                <p className="mt-3 text-ink-2">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="container-site py-20 md:py-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <p className="label">Products</p>
            <h2 className="display-2 mt-5 max-w-[12ch]">One job each, done completely.</h2>
            <p className="lead mt-6 max-w-[40ch]">
              Every Agmt product takes a single, well-defined part of legal work and handles it end
              to end. Execute is the first.
            </p>
          </div>
          <ProductIndex />
        </div>
      </section>

      {/* Principles */}
      <section className="on-night bg-night text-night-ink">
        <div className="container-site py-20 md:py-28">
          <p className="label">How we build</p>
          <h2 className="display-2 mt-5 max-w-[16ch]">Built the way a careful lawyer works.</h2>
          <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-10">
            {PRINCIPLES.map((p) => (
              <div key={p.label} className="border-t border-night-line pt-6">
                <p className="label">{p.label}</p>
                <h3 className="mt-4 font-serif text-[1.7rem] leading-[1.15] tracking-[-0.02em]">{p.title}</h3>
                <p className="mt-4 text-night-ink-2">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Blog */}
      {posts.length ? (
        <section className="container-site py-20 md:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="label">From the blog</p>
              <h2 className="display-2 mt-5 max-w-[16ch]">Notes on the work after the deal.</h2>
            </div>
            <Link to="/blog" className="link-arrow">
              All posts <ArrowRight className="arrow" />
            </Link>
          </div>
          <div className="mt-14">
            <PostGrid posts={posts.slice(0, 3)} />
          </div>
        </section>
      ) : null}

      {/* Close */}
      <section className={posts.length ? "border-t border-line" : undefined}>
        <div className="container-site py-20 md:py-28">
          <h2 className="display-1 max-w-[20ch]">Signing something soon?</h2>
          <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <p className="lead max-w-[46ch]">
              Execute is in closed beta. Ask for access in the app with your name and email, and
              we'll review your request personally.
            </p>
            <div className="flex flex-wrap gap-3">
            <a href={SITE.appUrl} className="btn btn-accent">
              Ask for access <ArrowUpRight className="arrow arrow-up" />
            </a>
              <Link to="/contact" className="btn btn-ghost">
                Write to us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
