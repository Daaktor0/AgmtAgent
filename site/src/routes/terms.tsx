import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalDocument, type Clause } from "@/components/legal";
import { seo } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/terms")({
  head: () =>
    seo({
      title: "Terms of Use",
      description:
        "The terms for using agmt.legal and Agmt's products, including Execute. Governed by the laws of India.",
      path: "/terms",
    }),
  component: Terms,
});

const email = <a href={`mailto:${SITE.email}`}>{SITE.email}</a>;

const CLAUSES: Clause[] = [
  {
    id: "about",
    title: "About these terms",
    body: (
      <>
        <p>
          These terms apply to agmt.legal and to Agmt's products, including Execute at
          app.agmt.legal (together, the “Services”). They are an agreement between you and Agmt. By
          using the Services, you accept them.
        </p>
        <p>
          If you use the Services for a firm or company, you confirm that you are allowed to accept
          these terms for it, and “you” includes it.
        </p>
      </>
    ),
  },
  {
    id: "beta",
    title: "Execute is in beta",
    body: (
      <>
        <p>
          Execute is in a closed beta. We decide who gets access, and we may add, change or remove
          features, pause the beta, or end it. We may also end your access, and will tell you when
          we do.
        </p>
        <p>Any fees for our products will be agreed with you before they apply.</p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>Give us accurate details, and keep them up to date.</li>
        <li>Keep your password to yourself. Access is personal and may not be shared.</li>
        <li>You are responsible for what happens under your account.</li>
        <li>Tell us straight away at {email} if you think someone else has used it.</li>
      </ul>
    ),
  },
  {
    id: "documents",
    title: "Your documents",
    body: (
      <>
        <p>
          You keep every right in the documents you use with the Services. Execute processes them
          in your browser, and Agmt does not receive them.
        </p>
        <p>
          You are responsible for having the right to use those documents, and for keeping your own
          copies. Signings are stored only in your browser, which can lose them if its data is
          cleared or the computer fails.
        </p>
      </>
    ),
  },
  {
    id: "judgment",
    title: "Your professional judgment",
    body: (
      <>
        <p>
          Execute is a tool for preparing executed copies. It does not give legal advice, and it
          does not replace your professional judgment.
        </p>
        <p>
          You are responsible for checking every executed copy, signature page and stamp paper
          before you rely on it or send it to anyone. Execute's checks and flags are there to help,
          and will not catch every problem.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "Using the Services properly",
    body: (
      <>
        <p>You must not:</p>
        <ul>
          <li>use the Services for anything unlawful, or in a way that infringes anyone's rights;</li>
          <li>try to get around access controls, or access another person's account;</li>
          <li>interfere with, overload or disrupt the Services or the systems they run on;</li>
          <li>
            copy, modify or reverse engineer the Services, except as the law allows despite this
            restriction; or
          </li>
          <li>resell or provide the Services to others without our written agreement.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ours",
    title: "What belongs to Agmt",
    body: (
      <>
        <p>
          The Services, their software, and Agmt's names, marks and content belong to Agmt or its
          licensors. We give you a personal, non-exclusive, non-transferable right to use the
          Services for your professional work while these terms apply.
        </p>
        <p>
          You are welcome to link to our blog and quote short passages with a credit and link.
        </p>
      </>
    ),
  },
  {
    id: "feedback",
    title: "Feedback",
    body: (
      <p>
        If you send us feedback or suggestions, we may use them to improve the Services without any
        obligation to you.
      </p>
    ),
  },
  {
    id: "others",
    title: "Other services",
    body: (
      <p>
        The Services run on infrastructure from third-party providers (see the{" "}
        <Link to="/privacy">Privacy Notice</Link>). Links to other websites are for convenience;
        we are not responsible for their content.
      </p>
    ),
  },
  {
    id: "warranties",
    title: "No guarantees",
    body: (
      <p>
        The Services are provided “as is” and “as available”, especially while in beta. To the
        extent the law allows, we make no promises that they will be uninterrupted, error-free or
        suitable for a particular purpose, or that their output will be complete or accurate.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limits on our liability",
    body: (
      <>
        <p>To the extent the law allows:</p>
        <ul>
          <li>
            Agmt is not liable for any indirect or consequential loss, or for loss of profit,
            business, goodwill or data, arising from the Services or these terms; and
          </li>
          <li>
            Agmt's total liability to you for all claims relating to the Services is limited to the
            amount you paid Agmt for them in the twelve months before the claim arose.
          </li>
        </ul>
        <p>Nothing in these terms limits liability that cannot be limited under law.</p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Suspension and ending",
    body: (
      <p>
        You can stop using the Services at any time, and ask us to delete your account. We may
        suspend or end your access if you break these terms, if the law requires it, or if we stop
        offering a Service. The clauses on your documents, what belongs to Agmt, no guarantees,
        limits on liability and governing law continue after access ends.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms as the Services change. We will update the date at the top and
        tell account holders about significant changes by email. Continuing to use the Services
        after a change means you accept the updated terms.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These terms are governed by the laws of India, and the courts of India have jurisdiction
        over any dispute arising from them. Before going to court, please write to us at {email} so
        we can try to resolve the matter together.
      </p>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <p>
        These terms, with the Privacy Notice, are the whole agreement between you and Agmt about the
        Services. If any part of them is found unenforceable, the rest still applies. If we don't
        enforce a right straight away, we have not given it up. You may not transfer your rights
        under these terms without our agreement.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: <p>Questions about these terms: write to Agmt at {email}.</p>,
  },
];

function Terms() {
  return (
    <LegalDocument
      title="Terms of Use"
      updated="2026-09-26"
      summary={
        <ul>
          <li>Execute is in beta: access is by invitation, and it will change.</li>
          <li>Your documents stay yours, on your computer.</li>
          <li>Execute helps you prepare executed copies. Checking them is still your call.</li>
          <li>These terms are governed by the laws of India.</li>
        </ul>
      }
      clauses={CLAUSES}
    />
  );
}
