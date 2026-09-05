import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Page, SiteFrame } from "@/components/site/frame";
import { ProofExample } from "@/components/site/proof-example";
export const Route = createFileRoute("/how")({
  component: HowPage,
  head: () => ({
    meta: [
      { title: "Meet Proof — Agmt" },
      {
        name: "description",
        content:
          "Meet Proof, Agmt’s first product in development: focused proofreading for Word agreements, with corrections and comments to review.",
      },
    ],
  }),
});
function HowPage() {
  return (
    <SiteFrame>
      <Page>
        <div className="section-heading">
          <p className="eyebrow">AGMT / PROOF</p>
          <span className="status-note">In development</span>
        </div>
        <div className="proof-grid proof-page-intro">
          <div>
            <h1 className="page-title">
              For the details
              <br />
              <em>that stay behind.</em>
            </h1>
            <p className="page-intro">
              The negotiation moves on. A repeated word, an unfinished blank or an old reference
              stays in the draft. Proof is being built for that final mechanical pass.
            </p>
            <Link to="/beta" className="button button-ink">
              Get Proof updates <ArrowUpRight size={18} aria-hidden />
            </Link>
          </div>
          <ProofExample />
        </div>
        <div className="editorial-rows">
          {[
            [
              "01",
              "Start with Word.",
              "The intended workflow begins with a supported Word agreement. Proof focuses on proofreading the document; it does not ask you to reconstruct the deal.",
            ],
            [
              "02",
              "Make a focused pass.",
              "The initial scope covers selected typos, repeated words, explicit placeholders, duplicate definition declarations and certain internal reference defects. Coverage depends on the document’s structure; Proof is not a complete substantive legal review.",
            ],
            [
              "03",
              "Keep the review in your document.",
              "The goal is a downloadable Word file with tracked corrections and anchored comments. You review the markup and decide what to accept.",
            ],
          ].map(([n, title, body]) => (
            <section key={n}>
              <span className="eyebrow">{n}</span>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <div className="proof-faq">
          <p className="eyebrow">A FEW DETAILS</p>
          <details>
            <summary>Can I use Proof yet?</summary>
            <p>
              Proof is in development. This site introduces the product; it does not offer document
              uploads. Sign up for Dispatch to hear about beta openings and launch.
            </p>
          </details>
          <details>
            <summary>Is Proof a legal review?</summary>
            <p>
              No. It is being built for focused mechanical proofreading. It does not assess whether
              a provision protects your position or replace your legal judgment.
            </p>
          </details>
          <details>
            <summary>What will happen to my existing beta request?</summary>
            <p>
              Your existing request stays on the list. Signing up for Dispatch does not cancel a
              booking or reserve an additional place.
            </p>
          </details>
        </div>
      </Page>
    </SiteFrame>
  );
}
