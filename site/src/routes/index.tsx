import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import { SiteFrame } from "@/components/site/frame";
import { DispatchForm } from "@/components/site/dispatch-form";
import { ProofExample } from "@/components/site/proof-example";
import { PLATFORM, DISPATCH } from "@/brand/copy";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return (
    <SiteFrame>
      <section className="hero site-container">
        <div className="hero-top">
          <p className="eyebrow">{PLATFORM.eyebrow}</p>
          <span className="status-note">
            <span aria-hidden /> A platform in the making
          </span>
        </div>
        <div className="hero-composition">
          <div className="hero-copy">
            <h1>
              More room
              <br />
              for <em>judgment.</em>
            </h1>
            <p className="hero-lede">{PLATFORM.lede}</p>
            <div className="hero-actions">
              <Link to="/how" className="button button-ink">
                Meet Proof <ArrowUpRight size={18} aria-hidden />
              </Link>
              <a href="#dispatch" className="text-link">
                Follow the build <ArrowRight size={17} aria-hidden />
              </a>
            </div>
          </div>
          <div className="margin-art" aria-hidden>
            <span className="art-label">A LITTLE LESS OF THIS.</span>
            <div className="art-stack">
              <div className="art-sheet sheet-back" />
              <div className="art-sheet sheet-middle" />
              <div className="art-sheet sheet-front">
                <span className="art-sheet-title">
                  The work around
                  <br />
                  the work.
                </span>
                <div className="art-list">
                  <span>Check. Again.</span>
                  <span>Find the reference.</span>
                  <span>Fix the same detail.</span>
                  <span>One more pass.</span>
                </div>
                <div className="art-margin">Make space.</div>
                <span className="art-page">AGMT / 001</span>
              </div>
            </div>
            <span className="art-note">
              For the part only you can do. <span>↗</span>
            </span>
          </div>
        </div>
        <div className="hero-bottom">
          <span>Built for the way legal work actually happens.</span>
          <a href="#idea" aria-label="Discover the idea behind Agmt">
            <ArrowDown size={16} aria-hidden /> Scroll to explore
          </a>
        </div>
      </section>
      <section className="idea-section" id="idea">
        <span id="problem" />
        <div className="site-container idea-grid">
          <p className="eyebrow">
            <span className="section-number">01 /</span> THE IDEA
          </p>
          <div>
            <h2>
              A profession built on thought.
              <br />
              <em>A day filled with everything else.</em>
            </h2>
            <div className="idea-prose">
              <p>
                Finding the detail. Checking it again. Getting the document ready for the next
                person. Necessary work has a way of taking up the whole day.
              </p>
              <p>
                Agmt starts there. We’re building practical tools around real legal tasks, so more
                of your attention can go where it matters.
              </p>
            </div>
            <Link to="/what" className="text-link">
              Why we’re building Agmt <ArrowUpRight size={17} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      <section className="proof-section site-container" id="proof">
        <div className="section-heading">
          <p className="eyebrow">
            <span className="section-number">02 /</span> FIRST ON THE DESK
          </p>
          <span className="status-note">Proof · In development</span>
        </div>
        <div className="proof-grid">
          <div className="proof-copy">
            <span className="product-name">Agmt / Proof</span>
            <h2>
              The last pass.
              <br />
              <em>A fresh pair of eyes.</em>
            </h2>
            <p>
              A focused proofreading tool for Word agreements. We’re building Proof to catch
              mechanical errors and return corrections and comments in the document you’re already
              working on.
            </p>
            <ul className="proof-points">
              <li>
                <span>01</span> A supported Word agreement goes in.
              </li>
              <li>
                <span>02</span> Focused proofreading checks run.
              </li>
              <li>
                <span>03</span> Word markup comes back for your review.
              </li>
            </ul>
            <Link to="/how" className="text-link">
              Take a closer look at Proof <ArrowUpRight size={18} aria-hidden />
            </Link>
          </div>
          <ProofExample />
        </div>
      </section>
      <section className="horizon-section" id="review">
        <div className="site-container horizon-grid">
          <div>
            <p className="eyebrow">
              <span className="section-number">03 /</span> THE WIDER VIEW
            </p>
            <h2>
              Agreements are
              <br />
              the beginning.
              <br />
              <em>Not the boundary.</em>
            </h2>
          </div>
          <div className="horizon-copy">
            <p>{PLATFORM.direction}</p>
            <div className="direction-row">
              <span>Building now</span>
              <strong>Proofreading with Proof</strong>
            </div>
            <div className="direction-row">
              <span>Exploring next</span>
              <strong>
                Review, document preparation
                <br />
                and the work between them
              </strong>
            </div>
            <p className="small-note">
              These are areas of exploration, not available products or a release schedule.
            </p>
            <Link to="/beta" className="text-link">
              Watch it take shape <ArrowUpRight size={17} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      <section className="dispatch-section site-container" id="dispatch">
        <span id="beta" className="anchor-alias" />
        <div className="dispatch-copy">
          <p className="eyebrow">
            <span className="section-number">04 /</span> {DISPATCH.name}
          </p>
          <h2>
            A note when
            <br />
            <em>there’s something new.</em>
          </h2>
          <p>{DISPATCH.body}</p>
          <div className="dispatch-detail">
            <span aria-hidden>↗</span>
            <p>New tools. Beta openings. The next chapter of Agmt.</p>
          </div>
        </div>
        <DispatchForm />
      </section>
    </SiteFrame>
  );
}
