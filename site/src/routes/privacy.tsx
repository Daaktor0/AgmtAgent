import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalDocument, type Clause } from "@/components/legal";
import { seo } from "@/lib/seo";
import { SITE } from "@/lib/site";

/*
 * Written from what the code does: site/ sets no cookies and loads no
 * analytics; web/ (Execute) processes documents in the browser and holds only
 * access requests, accounts, feedback and logs (web/docs/EXECUTE_LAUNCH.md).
 * If either changes, this notice changes with it.
 */

export const Route = createFileRoute("/privacy")({
  head: () =>
    seo({
      title: "Privacy Notice",
      description:
        "What personal data Agmt collects through agmt.legal and Execute, why, where it is kept, and your rights. Execute never receives your documents.",
      path: "/privacy",
    }),
  component: Privacy,
});

const email = (
  <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
);

const CLAUSES: Clause[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          This notice explains what personal data Agmt collects through agmt.legal and through
          Execute at app.agmt.legal, why we collect it, where it is kept, and the choices you have.
          “Agmt”, “we” and “us” mean Agmt, which operates both. For anything in this notice, write
          to {email}.
        </p>
      </>
    ),
  },
  {
    id: "documents",
    title: "Documents you use in Execute",
    body: (
      <>
        <p>
          Execute reads, sorts and assembles documents in your web browser. No agreement, signed
          page, stamp paper, file name or page text is sent to Agmt, and we cannot see them.
        </p>
        <p>
          Your signings are saved in your browser's storage on the computer you used, where only
          that browser can reach them. Clearing the site data for app.agmt.legal deletes them.
          Text recognition for scans and photos runs on your computer; the recognition data it needs
          is downloaded from app.agmt.legal, and nothing is sent back.
        </p>
      </>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <h3>When you ask for access to Execute</h3>
        <p>
          Your name, your email address and, if you choose to tell us, what you sign most often.
        </p>
        <h3>When you have an Execute account</h3>
        <p>
          Your email address and name, your password in hashed form (we never store the password
          itself), whether your email address is confirmed, and the status of your access. Signing
          in sets a cookie on app.agmt.legal that keeps you signed in. It is needed for the service
          and is not used to track you.
        </p>
        <h3>When you send feedback from Execute</h3>
        <p>
          The kind of feedback, your message, your email address if you give it and, unless you
          untick the box, technical details: your browser's name and version string, the page you
          were on and the version of Execute.
        </p>
        <h3>When you write to us</h3>
        <p>Your email address and whatever you choose to write.</p>
        <h3>Earlier sign-up lists</h3>
        <p>
          Earlier versions of agmt.legal had a list for product updates and a form for people
          building legal technology. Both are closed. We keep what people gave there (name, email
          address and, where given, firm, role, product interests and update choices, or a product
          website and consent to be contacted) and use it only for what each form said.
        </p>
        <h3>Technical records</h3>
        <p>
          Our hosting providers process IP addresses and request details to deliver the websites,
          keep them secure and prevent abuse. Execute keeps a log entry for each access request and
          each decision on one.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <>
        <ul>
          <li>To review access requests, and to give or end access to Execute.</li>
          <li>To run your account: signing in, confirming your email address, resetting your password.</li>
          <li>To email you about your request, your account and your access.</li>
          <li>To read and answer your feedback and messages, and to improve our products.</li>
          <li>To contact people on the earlier lists about what they asked for.</li>
          <li>To keep our services secure and working.</li>
        </ul>
        <p>
          We process personal data with your consent, which you give when you send it to us, and
          for the other lawful purposes permitted by the Digital Personal Data Protection Act, 2023.
          We do not sell personal data, use it for advertising, or use it to train AI models.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    title: "Who else handles it",
    body: (
      <>
        <p>We use a small number of providers who process personal data for us, under our instructions:</p>
        <ul>
          <li>
            <strong>Vercel</strong> hosts agmt.legal.
          </li>
          <li>
            <strong>Cloudflare</strong> runs Execute, including its access list and logs.
          </li>
          <li>
            <strong>A managed Postgres database provider</strong> stores Execute accounts and the
            earlier sign-up lists.
          </li>
          <li>
            <strong>Resend</strong> sends Execute's emails.
          </li>
          <li>
            <strong>Our email provider</strong> receives messages sent to {SITE.email}.
          </li>
        </ul>
        <p>
          Some of these providers may process data outside India. We share personal data with anyone
          else only when the law requires it.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <>
        <ul>
          <li>
            Access requests and accounts: for as long as the request or account exists, and for a
            reasonable time afterwards to answer questions or meet legal obligations.
          </li>
          <li>Feedback and emails: for as long as we need them to deal with what you wrote.</li>
          <li>Earlier sign-up lists: until you ask us to remove you, or we no longer need them.</li>
          <li>Technical logs: for the short periods our providers keep them.</li>
        </ul>
        <p>You can ask us to delete your data at any time (see “Your rights”).</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and analytics",
    body: (
      <>
        <p>
          agmt.legal sets no cookies and loads no analytics or advertising scripts. Its fonts and
          images are served from agmt.legal itself.
        </p>
        <p>
          app.agmt.legal uses a sign-in cookie for Execute accounts, and your browser's storage for
          your signings, as described above.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the Digital Personal Data Protection Act, 2023, you can:</p>
        <ul>
          <li>ask for a summary of the personal data we hold about you and how we use it;</li>
          <li>ask us to correct, complete, update or erase it;</li>
          <li>withdraw your consent, which stops future processing but does not affect what was done before;</li>
          <li>nominate someone to exercise these rights for you in the event of your death or incapacity; and</li>
          <li>have a grievance about our handling of your data addressed.</li>
        </ul>
        <p>
          Write to {email} and we will respond within a reasonable time. If you are not satisfied
          with our response, you may complain to the Data Protection Board of India.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        We use encrypted connections, store passwords only in hashed form, limit access to the
        people who need it, and choose providers with strong security practices. No system is
        perfectly secure. If a breach affects your personal data, we will tell you and the
        authorities as the law requires.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Our services are for legal professionals. They are not directed at children, and we do not
        knowingly collect children's personal data.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this notice",
    body: (
      <p>
        When our products or practices change, this notice will change with them. We will update
        the date at the top, and tell account holders about significant changes by email.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        For questions, requests or grievances about your personal data, write to Agmt at {email}.
        See also our <Link to="/terms">Terms of Use</Link>.
      </p>
    ),
  },
];

function Privacy() {
  return (
    <LegalDocument
      title="Privacy Notice"
      updated="2026-09-26"
      summary={
        <ul>
          <li>Execute never receives your documents. They are processed and kept on your computer.</li>
          <li>agmt.legal sets no cookies and uses no analytics.</li>
          <li>We hold only what you give us to get access, to sign in, or to write to us.</li>
          <li>We don't sell personal data or use it for advertising.</li>
        </ul>
      }
      clauses={CLAUSES}
    />
  );
}
