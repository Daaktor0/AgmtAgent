import { MessageSquare } from "lucide-react";
import { A11Y } from "@/brand/copy";

/** A synthetic Word-markup illustration. Never wired to a live document check. */
export function ProofSpecimen({ caption }: { caption: string }) {
  return (
    <figure>
      <div className="specimen p-6 sm:p-8" role="img" aria-label={A11Y.illustrativeExample}>
        <p className="eyebrow mb-5">Clause 4.2 · Notice</p>
        <p className="specimen-body">
          The Company shall <span className="specimen-del">recieve</span>{" "}
          <span className="specimen-ins">receive</span> the notice on{" "}
          <span className="specimen-placeholder">[●]</span>, addressed to the registered office.
        </p>
        <div className="specimen-comment mt-6">
          <MessageSquare size={18} aria-hidden className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Unfinished placeholder</p>
            <p className="text-helper mt-1">This date has not been filled in. Please complete or remove it.</p>
          </div>
        </div>
      </div>
      <figcaption className="text-helper mt-3">{caption}</figcaption>
    </figure>
  );
}
