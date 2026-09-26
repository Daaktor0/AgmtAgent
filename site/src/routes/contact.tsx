import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageIntro } from "@/components/layout";
import { EmailCopy } from "@/components/media";
import { seo } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/contact")({
  head: () =>
    seo({
      title: "Contact",
      description: `Write to Agmt at ${SITE.email}. Execute access is requested inside the app at app.agmt.legal.`,
      path: "/contact",
    }),
  component: Contact,
});

function Contact() {
  return (
    <>
      <PageIntro label="Contact" title="Write to us.">
        <p>One address for everything, read by the people who build Agmt.</p>
      </PageIntro>

      <section className="container-site pb-16">
        <EmailCopy />
      </section>

      <section className="container-site pb-24 md:pb-32">
        <div className="bracket-list">
          <Row topic="Execute access">
            The quickest way in is <b>Ask for access</b> at{" "}
            <a href={SITE.appUrl} className="link">
              app.agmt.legal
            </a>
            . Requests are reviewed there.
          </Row>
          <Row topic="Feedback on Execute">
            Use <b>Feedback</b> inside the app, or write to us. Please leave out client names and
            document text.
          </Row>
          <Row topic="Building legal technology?">
            We like hearing from people working on the same problems. Tell us what you're building.
          </Row>
          <Row topic="Your personal data">
            To see, correct or delete what we hold about you, write to us. The{" "}
            <Link to="/privacy" className="link">
              Privacy Notice
            </Link>{" "}
            explains what that is.
          </Row>
          <Row topic="Everything else">Press, partnerships and questions. Same address.</Row>
        </div>
      </section>
    </>
  );
}

function Row({ topic, children }: { topic: string; children: ReactNode }) {
  return (
    <div className="bracket-row">
      <span className="bracket-key">{topic}</span>
      <span className="bracket-mark" aria-hidden>
        )
      </span>
      <p className="max-w-[58ch] text-ink-2 [&_b]:font-semibold [&_b]:text-ink">{children}</p>
    </div>
  );
}
