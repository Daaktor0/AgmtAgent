import { describePlan } from "../lib/plan.ts";
import { copyFileName, copyParties, partyOrder, planFor, setCopyFileName, type AppState } from "../lib/state.ts";
import type { Actions } from "./App.tsx";

export function CopiesSection({ state, actions }: { state: AppState; actions: Actions }) {
  const copies = copyParties(state);
  const noCopy = partyOrder(state).filter((id) => state.parties[id].copy === "none");
  if (partyOrder(state).length === 0) return null;

  const plans = new Map(copies.map((id) => [id, planFor(state, id)]));
  const complete = copies.filter((id) => {
    const p = plans.get(id)!;
    return p.missingParties.length === 0 && !p.missingStamp;
  }).length;

  return (
    <section className="step" aria-labelledby="step-3">
      <h2 id="step-3">
        <span className="step-no">3</span> Executed copies
      </h2>

      <div className="copies-head">
        <p>
          <strong>
            {complete} of {copies.length}
          </strong>{" "}
          cop{copies.length === 1 ? "y is" : "ies are"} complete.
          {complete < copies.length ? " Incomplete copies keep the unsigned page and are flagged below." : ""}
        </p>
        {copies.length > 0 ? (
          <button type="button" className="btn btn-primary" onClick={() => void actions.downloadAllCopies()} data-testid="download-all">
            Download all {copies.length} (.zip)
          </button>
        ) : null}
      </div>

      <ul className="copies">
        {copies.map((id) => {
          const plan = plans.get(id)!;
          const ok = plan.missingParties.length === 0 && !plan.missingStamp;
          return (
            <li key={id} className={`copy${ok ? "" : " copy-warn"}`} data-testid="copy">
              <div className="copy-main">
                <label className="copy-name">
                  <span className="copy-for">
                    {state.parties[id].name} · {state.parties[id].copy === "original" ? "Original" : "Counterpart"}
                  </span>
                  <input
                    aria-label={`File name for ${state.parties[id].name}'s copy`}
                    value={copyFileName(state, id)}
                    onChange={(e) => actions.update((s) => setCopyFileName(s, id, e.target.value))}
                  />
                </label>
                <p className="plan">
                  {describePlan(plan, (att) => state.meta[att]?.pageCount ?? 1).map((part, i) => (
                    <span key={i} className={part.startsWith("Unsigned") ? "plan-part plan-bad" : "plan-part"}>
                      {part}
                    </span>
                  ))}
                </p>
                {ok ? (
                  <p className="ok">Complete</p>
                ) : (
                  <p className="warn" data-testid="copy-warning">
                    {[
                      plan.missingStamp ? "No stamp paper yet" : null,
                      plan.missingParties.length
                        ? `Awaiting countersigned page from ${plan.missingParties.map((p) => state.parties[p].name).join(", ")}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <button type="button" className="btn" onClick={() => void actions.downloadCopy(id)}>
                Download
              </button>
            </li>
          );
        })}
      </ul>

      {noCopy.length ? (
        <p className="hint">No executed copy for: {noCopy.map((id) => state.parties[id].name).join(", ")}.</p>
      ) : null}
    </section>
  );
}
