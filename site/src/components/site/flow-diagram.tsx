import { ArrowRight, FileCheck2, FileText, ListChecks, PenLine } from "lucide-react";
import { FLOW } from "@/brand/copy";

const ICONS = [FileText, PenLine, FileCheck2, ListChecks, ArrowRight] as const;

export function FlowDiagram() {
  return (
    <figure className="mt-8">
      <ol className="grid overflow-hidden border border-rule bg-card sm:grid-cols-5">
        {FLOW.map((item, index) => {
          const Icon = ICONS[index];
          return (
            <li
              key={item.step}
              className="relative border-b border-rule p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <div className="flex items-center justify-between gap-3">
                <Icon className="size-5 text-accent" strokeWidth={1.6} aria-hidden />
                <span className="font-mono text-[0.6875rem] text-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="mt-5 font-serif text-xl leading-tight text-ink">{item.step}</p>
              <p className="mt-1 text-sm leading-snug text-muted">{item.note}</p>
            </li>
          );
        })}
      </ol>
      <figcaption className="mt-3 text-sm text-faint">
        The document moves quickly. The proof still has to be exact.
      </figcaption>
    </figure>
  );
}
