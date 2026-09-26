import { createFileRoute, Link } from "@tanstack/react-router";
import { ExecuteMark } from "@/components/brand";
import { Alert, ArrowRight, ArrowUpRight, Check, Clock } from "@/components/icons";
import { Screenshot } from "@/components/media";
import { seo } from "@/lib/seo";
import { SITE } from "@/lib/site";

/*
 * Every claim on this page comes from web/docs/EXECUTE_LAUNCH.md or the app's
 * own copy. Change the product, change this page.
 */

const DESCRIPTION =
  "Execute prepares the signature pages for a multi-party agreement, sorts the signed pages and stamp papers as they come back, flags what's missing or wrong, and assembles one executed copy per party. In your browser; nothing is uploaded.";

export const Route = createFileRoute("/products/execute")({
  head: () => {
    const head = seo({
      title: "Execute",
      description: DESCRIPTION,
      path: "/products/execute",
      image: "/og/execute.png",
      imageAlt: "Execute by Agmt: every page, every party, one executed copy each.",
    });
    return {
      ...head,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Execute",
            url: SITE.appUrl,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web browser (Chrome, Edge)",
            description: DESCRIPTION,
            publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
          }),
        },
      ],
    };
  },
  component: ExecutePage,
});

const STEPS = [
  {
    title: "Add the final agreement",
    body: "Drop in the execution version as a PDF. Execute finds the unsigned signature pages and who signs each. A deal with several agreements goes in one signing.",
  },
  {
    title: "Send out signature pages",
    body: "Download one PDF per party, taken from the final itself, so the pages match it exactly.",
  },
  {
    title: "Drop in the returns",
    body: "Signed pages and stamp papers, as PDFs, scans or phone photos, all at once or as they arrive. Each is read on your computer and placed with its party.",
  },
  {
    title: "Download executed copies",
    body: "One complete PDF per party, stamp paper in front, zipped with a closing index.",
  },
];

const SOURCES = [
  {
    name: "In this agreement",
    body: "Execute finds the unsigned signature pages already in the final. Signed pages replace them in place.",
  },
  {
    name: "Make from the parties",
    body: "Execute reads the parties clause, following references like “the persons listed in Part A of Schedule 1” into the schedule. You confirm the list and each party's signing block, and it makes one page per party.",
  },
  {
    name: "Use my template",
    body: "Upload your own signature page as a PDF. Execute copies it for each party and changes only the name, in the same place and style. The sample name is removed from the page's text, not painted over.",
  },
];

const CHECKS = [
  { title: "A return that hasn't come back", body: "Every awaited page stays on the list until it arrives, with a chase list you can copy." },
  { title: "A stamp paper in another party's name", body: "Each e-stamp certificate is read and matched to the party it names." },
  { title: "The same certificate used twice", body: "One certificate number on two copies is flagged. Each copy needs its own." },
  { title: "A page that doesn't read like the final", body: "A returned page from the wrong document, or the wrong page, is flagged for you to check." },
];

const DOCUMENT_FACTS = [
  {
    title: "Read on your machine",
    body: "PDFs are read in the browser. Scans and phone photos are read by text recognition that runs on your computer.",
  },
  {
    title: "Saved on this computer only",
    body: "Signings are kept in this browser's storage, so you can close the tab and carry on later. Clearing the site's data removes them.",
  },
  {
    title: "No AI model",
    body: "Explicit rules and on-device text recognition. Deterministic, explainable, and never inventing a name.",
  },
  {
    title: "No Agmt mark",
    body: "Signature pages Execute makes carry no Agmt name or mark, visible or in the file's metadata.",
  },
];

const LIMITS = [
  "The final agreement must be a PDF. For a scanned final with no text, you mark the signature pages yourself.",
  "Text in scans and photos is read in English. Handwriting isn't read; typed names and headings are.",
  "“Doesn't read like the final” catches the wrong page or document, not a single changed word.",
  "iPhone HEIC photos don't open in Chrome or Edge. JPG and PDF work.",
  "A signing lives in one browser on one computer. There's no sync or sharing yet.",
  "Tested in Chrome and Edge. Safari and Firefox aren't verified yet.",
];

const FAQ = [
  {
    q: "How do I get access?",
    a: "Execute is in closed beta. Choose “Ask for access” at app.agmt.legal and give your name and email. Each request is reviewed, and once you're approved you'll get an email to set up your account.",
  },
  {
    q: "Are my documents uploaded anywhere?",
    a: "No. Agreements, signed pages and stamp papers are read, sorted and assembled in your browser. No document, file name or page text is sent to Agmt. Agmt holds only your account details and anything you choose to send, like feedback.",
  },
  {
    q: "Does Execute use AI?",
    a: "No. It uses explicit rules and text recognition that runs on your computer. Every match and every flag has a reason you can see.",
  },
  {
    q: "Does it handle e-stamp papers?",
    a: "Yes. Execute reads each e-stamp certificate, puts it in front of the right party's copy, and flags a certificate in another party's name or used on two copies.",
  },
  {
    q: "What happens to a file Execute can't place?",
    a: "It goes to a short “Needs you” list. You say what it is and whose it is, and Execute puts it in place.",
  },
  {
    q: "Can my team work on the same signing?",
    a: "Not yet. A signing lives in one browser on one computer.",
  },
];

function ExecutePage() {
  return (
    <>
      {/* Opening */}
      <section className="container-site pt-14 md:pt-20">
        <div className="reveal flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-3">
            <ExecuteMark size={36} className="text-ink" />
            <span className="font-serif text-[2rem] leading-none tracking-[-0.03em]">Execute</span>
          </span>
          <span className="pill pill-execute">
            <span className="pill-dot" /> Closed beta
          </span>
        </div>
        <h1 className="display-1 reveal reveal-2 mt-8">
          <span className="block">Every page.</span>
          <span className="block">Every party.</span>
          <span className="block">One executed copy each.</span>
        </h1>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
          <p className="lead reveal reveal-3 max-w-[54ch]">
            Drop in the final agreement. Execute prepares the signature pages, sorts the signed pages
            and stamp papers as they come back, flags anything missing or wrong, and assembles one
            complete executed copy for every party. All of it in your browser.
          </p>
          <div className="reveal reveal-4 flex flex-wrap gap-3 lg:justify-end">
            <a href={SITE.appUrl} className="btn btn-accent">
              Ask for access <ArrowUpRight className="arrow arrow-up" />
            </a>
            <a href="#how" className="btn btn-ghost">
              How it works
            </a>
          </div>
        </div>
        <ul className="reveal reveal-4 mt-10 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-5 font-mono text-[0.78rem] tracking-[0.04em] text-ink-3 uppercase">
          <li>Runs in your browser</li>
          <li>Nothing uploaded</li>
          <li>PDFs, scans and phone photos</li>
          <li>E-stamp papers</li>
        </ul>
      </section>
      <section className="relative mt-14 md:mt-20">
        <div aria-hidden className="absolute inset-x-0 top-1/3 bottom-0 border-t border-line bg-bg-2" />
        <div className="container-site relative pb-20 md:pb-28">
          <Screenshot
            eager
            src="/products/execute/documents.webp"
            width={1360}
            height={900}
            alt="Execute's documents screen for a sample signing of two agreements: signature pages found in the final, each with the party who signs it, and the three ways to get signature pages."
            caption="A sample signing: two agreements, seven fictional parties, signature pages found in the final."
          />
        </div>
      </section>

      {/* Why */}
      <section className="container-site grid gap-8 py-20 md:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="label">Why it exists</p>
          <h2 className="display-2 mt-5 max-w-[14ch]">The last mile of every deal is still done by hand.</h2>
        </div>
        <div className="lead space-y-5 lg:pt-12">
          <p>
            A twelve-party agreement means twelve sets of signature pages out and back. They return
            over days, from different cities, as scans, phone photos and PDFs, some with e-stamp
            papers and some without.
          </p>
          <p>
            Someone has to match each page to its party, notice what hasn't come back, check every
            stamp paper, and put together a complete copy for everyone. It's slow and exacting, it
            usually happens late at night, and one misplaced page means doing it again.
          </p>
          <p className="text-ink">Execute does that part.</p>
        </div>
      </section>

      {/* How */}
      <section id="how" className="border-t border-line">
        <div className="container-site py-20 md:py-28">
          <p className="label">How it works</p>
          <h2 className="display-2 mt-5 max-w-[16ch]">From the final to executed copies in four steps.</h2>
          <ol className="mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="border-t border-ink pt-6">
                <span className="font-mono text-[0.85rem] font-medium text-blue">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="title-3 mt-4">{step.title}</h3>
                <p className="mt-3 text-ink-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Signature pages */}
      <section className="border-t border-line bg-bg-2">
        <div className="container-site py-20 md:py-28">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <div>
              <p className="label">Signature pages</p>
              <h2 className="display-2 mt-5 max-w-[12ch]">Whatever state the final is in.</h2>
              <p className="lead mt-6 max-w-[40ch]">
                Some finals come with signature pages, some don't, and some firms have their own.
                Execute works with all three, chosen per document.
              </p>
            </div>
            <div className="bracket-list">
              {SOURCES.map((source) => (
                <div key={source.name} className="bracket-row">
                  <span className="bracket-key">{source.name}</span>
                  <span className="bracket-mark" aria-hidden>
                    )
                  </span>
                  <p className="text-ink-2">{source.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Checks */}
      <section className="container-site py-20 md:py-28">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <p className="label">Checks</p>
            <h2 className="display-2 mt-5 max-w-[13ch]">It notices what you'd hate to miss.</h2>
            <ul className="mt-10 grid gap-7">
              {CHECKS.map((check) => (
                <li key={check.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-4">
                  <span className="mt-0.5 grid size-7 place-items-center rounded-full bg-execute-wash text-execute">
                    <Alert size={14} strokeWidth={2.4} />
                  </span>
                  <span>
                    <span className="block text-[1.1rem] font-semibold">{check.title}</span>
                    <span className="mt-1 block text-ink-2">{check.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Screenshot
            className="lg:mt-8"
            src="/products/execute/returns.webp"
            width={1360}
            height={1058}
            alt="Execute's returns checklist: each party's signed page and stamp paper for two agreements, with one page awaited and two stamp papers to fix."
            caption="Two stamp papers to fix and one page awaited. Those copies wait until they're resolved."
          />
        </div>
      </section>

      {/* Output */}
      <section className="border-t border-line bg-bg-2">
        <div className="container-site py-20 md:py-28">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <p className="label">What you get back</p>
              <h2 className="display-2 mt-5 max-w-[14ch]">One PDF per party. A closing index for the file.</h2>
            </div>
            <p className="lead lg:pt-12">
              Each executed copy has its stamp paper in front, then the final with every signature
              page replaced by the signed one. Pages Execute made go at the end, after the schedules.
              The zip includes a closing index of every copy, party and stamp certificate.
            </p>
          </div>
          <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
            <Screenshot
              src="/products/execute/copies.webp"
              width={1360}
              height={1290}
              alt="Execute's executed copies screen: four of eleven copies ready, each copy's pages in order with the stamp paper first, and a certificate flagged as used on two copies."
              caption="Copies are assembled as soon as they're complete. The rest say what they're waiting for."
            />
            <figure className="min-w-0">
              <img
                src="/products/execute/closing-index.webp"
                width={1100}
                height={920}
                loading="lazy"
                decoding="async"
                alt="A closing index PDF listing each party's executed copy with its stamp certificate number and file name, and the copies not yet included with the reason."
                className="block h-auto w-full border border-line-2 shadow-[var(--shadow-page)]"
              />
              <figcaption className="mt-3 text-[0.875rem] text-ink-3">
                The closing index that comes with every download.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Documents */}
      <section id="documents" className="on-night bg-night text-night-ink">
        <div className="container-site py-20 md:py-28">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <p className="label">Your documents</p>
              <h2 className="display-2 mt-5 max-w-[13ch]">Your documents never leave your computer.</h2>
            </div>
            <p className="text-[1.2rem] leading-relaxed text-night-ink-2 lg:pt-12">
              Execute runs entirely in your browser. Final agreements, signed returns and stamp
              papers are read, sorted and assembled on your own computer. No document, file name or
              page text is ever sent to Agmt.
            </p>
          </div>
          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {DOCUMENT_FACTS.map((fact) => (
              <div key={fact.title} className="border-t border-night-line pt-6">
                <Check size={18} className="text-night-blue" />
                <h3 className="mt-4 font-serif text-[1.45rem] leading-tight tracking-[-0.015em]">{fact.title}</h3>
                <p className="mt-3 text-night-ink-2">{fact.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Limits */}
      <section className="container-site py-20 md:py-28">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <p className="label">In the beta</p>
            <h2 className="display-2 mt-5 max-w-[12ch]">What it doesn't do yet.</h2>
            <p className="lead mt-6 max-w-[40ch]">
              You should know a tool's limits before you rely on it. These are Execute's today.
            </p>
          </div>
          <ul className="border-t border-line">
            {LIMITS.map((limit) => (
              <li key={limit} className="grid grid-cols-[24px_minmax(0,1fr)] gap-4 border-b border-line py-5 text-ink-2">
                <Clock size={18} className="mt-1 text-ink-3" />
                <span>{limit}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Questions */}
      <section className="border-t border-line">
        <div className="container-site grid gap-8 py-20 md:py-28 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <p className="label">Questions</p>
            <h2 className="display-2 mt-5 max-w-[10ch]">Asked before signing up.</h2>
          </div>
          <div className="faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <span className="plus" aria-hidden />
                </summary>
                <div>{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="border-t border-line bg-bg-2">
        <div className="container-site flex flex-col items-start gap-8 py-20 md:py-28 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="display-1 max-w-[13ch]">Your next signing, sorted.</h2>
            <p className="lead mt-7 max-w-[48ch]">
              Ask for access with your name and email. Once you're approved, you'll get an email to
              set up your account, and you can start with the built-in sample.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={SITE.appUrl} className="btn btn-accent">
              Ask for access <ArrowUpRight className="arrow arrow-up" />
            </a>
            <Link to="/contact" className="btn btn-ghost">
              Questions? Write to us <ArrowRight className="arrow" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
