import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Page, SiteFrame } from "@/components/site/frame";
import { PLATFORM } from "@/brand/copy";
export const Route = createFileRoute("/what")({
  component: WhatPage,
  head: () => ({
    meta: [{ title: "The idea — Agmt" }, { name: "description", content: PLATFORM.direction }],
  }),
});
function WhatPage() {
  return (
    <SiteFrame>
      <Page>
        <p className="eyebrow">THE IDEA / AGMT</p>
        <h1 className="page-title">
          Good legal work needs
          <br />
          <em>room to think.</em>
        </h1>
        <p className="page-intro">{PLATFORM.direction}</p>
        <div className="editorial-rows">
          {[
            [
              "01",
              "Start with the actual task.",
              "The final proofreading pass. Preparing documents for the next person. Following a detail through a stack of edits. We’re interested in the specific tasks that quietly consume a legal professional’s day.",
            ],
            [
              "02",
              "Make the output useful.",
              "A tool should leave you with something you can work with. For Proof, that means a Word document with corrections and comments you can review, rather than another place to copy your work from.",
            ],
            [
              "03",
              "Keep judgment with the person.",
              "Legal work needs context, experience and responsibility. Our aim is to make its repetitive parts easier, while keeping decisions with the people doing the work.",
            ],
            [
              "04",
              "Build one useful thing at a time.",
              "Proof is the first product in development. Agreement workflows give us a concrete place to start. They do not define the limits of Agmt.",
            ],
          ].map(([n, title, body]) => (
            <section key={n}>
              <span className="eyebrow">{n}</span>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <div className="page-end">
          <p>Start with what we’re building now.</p>
          <Link to="/how" className="button button-ink">
            Meet Proof <ArrowUpRight size={18} aria-hidden />
          </Link>
        </div>
      </Page>
    </SiteFrame>
  );
}
