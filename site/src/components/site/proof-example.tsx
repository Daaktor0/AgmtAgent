import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
/** An intentionally synthetic editorial illustration, never a product result. */
export function ProofExample() {
  const [markup, setMarkup] = useState(true);
  return (
    <figure className="proof-example">
      <div className="example-toolbar">
        <span>THE LAST PASS</span>
        <button type="button" aria-pressed={markup} onClick={() => setMarkup(!markup)}>
          {markup ? "Hide" : "Show"} illustrative markup{" "}
          <span className={`mini-switch ${markup ? "on" : ""}`} aria-hidden />
        </button>
      </div>
      <div className="example-paper">
        <div className="paper-topline">
          <span>01 / AGREEMENT EXTRACT</span>
          <span>§</span>
        </div>
        <p className="paper-heading">
          The details deserve
          <br />a second look.
        </p>
        <div className="extract">
          <span className="clause-number">4.2</span>
          <p>
            The Company shall{" "}
            {markup ? (
              <>
                <del>recieve</del> <ins>receive</ins>
              </>
            ) : (
              "recieve"
            )}{" "}
            the notice on <span className={markup ? "placeholder-mark" : ""}>[●]</span>.
          </p>
        </div>
        <div className={`example-comment ${markup ? "" : "comment-hidden"}`} aria-hidden={!markup}>
          <span className="comment-pin">1</span>
          <div>
            <strong>An unfinished detail.</strong>
            <p>This placeholder is unfilled. Please complete or remove it.</p>
          </div>
          <ArrowUpRight size={18} aria-hidden />
        </div>
        <div className="paper-bottomline">
          <span>YOUR DOCUMENT. YOUR FINAL CALL.</span>
          <span>01</span>
        </div>
      </div>
      <figcaption>Illustrative markup · not a live document check</figcaption>
    </figure>
  );
}
