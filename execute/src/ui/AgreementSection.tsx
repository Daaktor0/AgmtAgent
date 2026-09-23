import {
  addExistingParty, addParty, partyOrder, removePartyFromPage, setTitle, signaturePageIndices, toggleSignaturePage,
  updateParty, type AppState,
} from "../lib/state.ts";
import type { Actions } from "./App.tsx";

export function AgreementSection({ state, thumbs, actions }: { state: AppState; thumbs: (string | null)[]; actions: Actions }) {
  const agreement = state.agreement!;
  const sigPages = signaturePageIndices(state);
  const everyone = partyOrder(state);

  return (
    <section className="step" aria-labelledby="step-1">
      <h2 id="step-1">
        <span className="step-no">1</span> Signature pages and parties
      </h2>

      <div className="field title-field">
        <label htmlFor="title">Agreement name, used in file names</label>
        <input id="title" value={state.title} onChange={(e) => actions.update((s) => setTitle(s, e.target.value))} />
        <p className="hint">
          {agreement.fileName} · {agreement.pageCount} pages
        </p>
      </div>

      <p className="hint">
        {sigPages.length === 0
          ? "No page looked like a signature page. Click the signature pages below to mark them."
          : `${sigPages.length} page${sigPages.length === 1 ? " looks" : "s look"} like signature pages. Click any page to mark or unmark it.`}
      </p>
      <div className="pages" role="group" aria-label="Agreement pages">
        {thumbs.map((url, i) => {
          const on = Boolean(state.sigPages[i]);
          return (
            <button
              key={i}
              type="button"
              className={`page${on ? " page-on" : ""}`}
              aria-pressed={on}
              aria-label={`Page ${i + 1}${on ? ", signature page" : ""}`}
              data-testid={`page-${i + 1}`}
              onClick={() => actions.update((s) => toggleSignaturePage(s, i))}
            >
              {url ? <img src={url} alt="" /> : <span className="page-blank" />}
              <span className="page-no">{i + 1}</span>
              {on ? <span className="page-tag">Signature</span> : null}
            </button>
          );
        })}
      </div>

      {sigPages.length > 0 ? (
        <div className="sig-list">
          {sigPages.map((page) => {
            const here = state.sigPages[page];
            const others = everyone.filter((id) => !here.includes(id));
            return (
              <div key={page} className="sig-row" data-testid={`sig-page-${page + 1}`}>
                <div className="sig-thumb">{thumbs[page] ? <img src={thumbs[page]!} alt={`Page ${page + 1}`} /> : null}</div>
                <div className="sig-body">
                  <p className="sig-label">Page {page + 1} · signed by</p>
                  <ul className="party-inputs">
                    {here.map((id) => (
                      <li key={id}>
                        <input
                          aria-label={`Party name on page ${page + 1}`}
                          value={state.parties[id].name}
                          onChange={(e) => actions.update((s) => updateParty(s, id, { name: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove ${state.parties[id].name} from page ${page + 1}`}
                          onClick={() => actions.update((s) => removePartyFromPage(s, page, id))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="sig-add">
                    <button type="button" className="text-btn" onClick={() => actions.update((s) => addParty(s, page))}>
                      + Add a party
                    </button>
                    {others.length ? (
                      <select
                        aria-label={`Add a party from another page to page ${page + 1}`}
                        value=""
                        onChange={(e) => e.target.value && actions.update((s) => addExistingParty(s, page, e.target.value))}
                      >
                        <option value="">+ A party from another page…</option>
                        {others.map((id) => (
                          <option key={id} value={id}>
                            {state.parties[id].name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {everyone.length > 0 ? (
        <div className="send-out">
          <div>
            <p className="send-title">Send for signature</p>
            <p className="hint">One PDF per party, cut from the final agreement itself, so it cannot differ from it.</p>
          </div>
          <button type="button" className="btn" onClick={() => void actions.downloadAllPacks()} data-testid="download-packs">
            Download {everyone.length} signature page{everyone.length === 1 ? "" : "s"} (.zip)
          </button>
        </div>
      ) : null}
    </section>
  );
}
