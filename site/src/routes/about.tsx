import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "@/components/icons";
import { PageIntro } from "@/components/layout";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () =>
    seo({
      title: "About",
      description:
        "Agmt builds focused software for the procedural work of legal practice. Each product takes one job and handles it end to end. Execute is the first.",
      path: "/about",
    }),
  component: About,
});

const HOW_WE_BUILD = [
  {
    key: "Documents",
    title: "Kept on your computer.",
    body: "Where a job can be done on your own machine, it's done there. Execute never sends a document, file name or page text to Agmt.",
  },
  {
    key: "Method",
    title: "Rules you can explain.",
    body: "If a result is going to be relied on, you should be able to see why it came out that way. Execute uses explicit rules and on-device text recognition, not an AI model.",
  },
  {
    key: "Output",
    title: "Yours, unbranded.",
    body: "Nothing Execute makes for the other side carries Agmt's name or mark. The work goes out as your firm's work.",
  },
  {
    key: "Scope",
    title: "One job, finished.",
    body: "A product earns its place by finishing the job, including the awkward cases: scanned returns, phone photos, a stamp paper in the wrong name.",
  },
  {
    key: "Limits",
    title: "Stated up front.",
    body: "Every product page says what it doesn't do yet. You should know a tool's edges before you trust it with a closing.",
  },
];

function About() {
  return (
    <>
      <PageIntro label="About" title="Software for the parts of legal work that have to be exactly right." />

      <section className="container-site pb-20 md:pb-28">
        <div className="grid gap-10 border-t border-ink pt-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <p className="label">Why Agmt exists</p>
          <div className="space-y-6 font-serif text-[clamp(1.3rem,1.9vw,1.6rem)] leading-[1.5] tracking-[-0.01em]">
            <p>
              Legal practice runs on procedure. Signature pages, stamp papers, counterparts, closing
              sets. The work is exacting and repetitive, and most of it is still done by hand, late in
              the day, by people trained to do far more interesting things.
            </p>
            <p className="text-ink-2">
              Agmt makes focused products for that work. Each one takes a single job and handles it
              end to end, carefully enough that a lawyer can rely on the result and explain it to a
              client.
            </p>
            <p className="text-ink-2">
              The first is{" "}
              <Link to="/products/execute" className="link text-ink">
                Execute
              </Link>
              , which assembles the executed copies of multi-party agreements. It's in closed beta
              now. More products will follow, built the same way.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-bg-2">
        <div className="container-site py-20 md:py-28">
          <p className="label">How we build</p>
          <h2 className="display-2 mt-5 max-w-[14ch]">Five rules we don't break.</h2>
          <div className="bracket-list mt-14">
            {HOW_WE_BUILD.map((rule) => (
              <div key={rule.key} className="bracket-row">
                <span className="bracket-key text-ink-3">{rule.key}</span>
                <span className="bracket-mark" aria-hidden>
                  )
                </span>
                <div>
                  <h3 className="font-serif text-[1.5rem] leading-tight tracking-[-0.015em]">{rule.title}</h3>
                  <p className="mt-2 max-w-[60ch] text-ink-2">{rule.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-site flex flex-col items-start gap-8 py-20 md:py-28 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="display-2 max-w-[16ch]">Working on something we should hear about?</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/contact" className="btn btn-primary">
            Get in touch <ArrowRight className="arrow" />
          </Link>
          <Link to="/blog" className="btn btn-ghost">
            Read the blog
          </Link>
        </div>
      </section>
    </>
  );
}
