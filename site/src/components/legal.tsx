import type { ReactNode } from "react";
import { formatDate } from "@/lib/utils";

export type Clause = { id: string; title: string; body: ReactNode };

/**
 * A legal document laid out like one: numbered clauses (numbered by CSS, so
 * the contents list and the clauses can never disagree), a contents list that
 * follows you on wide screens, and the date it last changed.
 */
export function LegalDocument({
  title,
  updated,
  summary,
  clauses,
}: {
  title: string;
  updated: string;
  summary: ReactNode;
  clauses: Clause[];
}) {
  return (
    <>
      <section className="container-site pt-16 pb-10 md:pt-24">
        <p className="label">Legal</p>
        <h1 className="display-1 mt-5">{title}</h1>
        <p className="mt-6 font-mono text-[0.8rem] tracking-[0.04em] text-ink-3 uppercase">
          Last updated <time dateTime={updated}>{formatDate(updated)}</time>
        </p>
      </section>
      <section className="container-site grid gap-12 pb-24 md:pb-32 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="Contents" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="label">Contents</p>
            <ol className="mt-4 space-y-2 text-[0.92rem]">
              {clauses.map((clause, i) => (
                <li key={clause.id} className="grid grid-cols-[1.8rem_1fr]">
                  <span className="font-mono text-[0.8rem] text-ink-3">{i + 1}.</span>
                  <a href={`#${clause.id}`} className="text-ink-2 hover:text-blue">
                    {clause.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <div className="min-w-0 max-w-[760px]">
          <div className="mb-12 rounded-[14px] border border-line bg-bg-2 p-6 md:p-8 [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-ink-2">
            <p className="label">In short</p>
            <div className="mt-3">{summary}</div>
          </div>
          <div className="legal">
            {clauses.map((clause) => (
              <section key={clause.id} id={clause.id} aria-labelledby={`${clause.id}-title`}>
                <h2 id={`${clause.id}-title`}>{clause.title}</h2>
                {clause.body}
              </section>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
