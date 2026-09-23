import { useState } from "react";
import type { AttachmentRole, CopyType } from "../lib/names.ts";
import {
  assign, assignAllSuggested, coParties, moveStamp, partyOrder, partyPages, rotateAttachment, signedFor, stampsFor,
  toggleSignedParty, unassign, unassigned, updateParty, type AppState,
} from "../lib/state.ts";
import type { Actions } from "./App.tsx";
import { DropZone } from "./DropZone.tsx";

const ACCEPT = "application/pdf,.pdf,image/*";

export function ReturnsSection({ state, actions }: { state: AppState; actions: Actions }) {
  const parties = partyOrder(state);
  const tray = unassigned(state);
  const ready = tray.filter((id) => {
    const p = state.placement[id];
    return p.role === "unassigned" && p.suggestedRole && p.suggestedParty;
  }).length;

  if (parties.length === 0) return null;

  return (
    <section className="step" aria-labelledby="step-2">
      <h2 id="step-2">
        <span className="step-no">2</span> Countersigned pages and stamp papers
      </h2>

      <DropZone onFiles={(f) => void actions.addFiles(f)} accept={ACCEPT} label="Add countersigned pages and stamp papers" testId="returns-drop">
        <strong>Drop everything that has come back</strong>
        <span>Countersigned pages and stamp papers, as PDFs or photos. We match each file to a party by its name.</span>
      </DropZone>

      {tray.length > 0 ? (
        <div className="tray" data-testid="tray">
          <div className="tray-head">
            <p>
              <strong>{tray.length}</strong> file{tray.length === 1 ? "" : "s"} to place
            </p>
            {ready > 0 ? (
              <button type="button" className="btn" onClick={() => actions.update(assignAllSuggested)} data-testid="place-all">
                Place {ready} as suggested
              </button>
            ) : null}
          </div>
          <ul className="tray-list">
            {tray.map((id) => (
              <TrayItem key={id} id={id} state={state} actions={actions} />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="party-grid">
        {parties.map((id) => (
          <PartyCard key={id} partyId={id} state={state} actions={actions} />
        ))}
      </div>
    </section>
  );
}

function TrayItem({ id, state, actions }: { id: string; state: AppState; actions: Actions }) {
  const place = state.placement[id];
  const suggestedRole = place.role === "unassigned" ? place.suggestedRole : null;
  const suggestedParty = place.role === "unassigned" ? place.suggestedParty : null;
  const [role, setRole] = useState<AttachmentRole | "">(suggestedRole ?? "");
  const [party, setParty] = useState(suggestedParty ?? "");
  const meta = state.meta[id];

  return (
    <li className="tray-item">
      <img className="file-thumb" src={meta.thumb} alt="" />
      <div className="tray-body">
        <p className="file-name">{meta.fileName}</p>
        <p className="hint">
          {meta.pageCount} page{meta.pageCount === 1 ? "" : "s"}
        </p>
        <div className="tray-controls">
          <select aria-label={`What is ${meta.fileName}?`} value={role} onChange={(e) => setRole(e.target.value as AttachmentRole)}>
            <option value="">This is…</option>
            <option value="signed">Countersigned page</option>
            <option value="stamp">Stamp paper</option>
          </select>
          <select aria-label={`Which party sent ${meta.fileName}?`} value={party} onChange={(e) => setParty(e.target.value)}>
            <option value="">From…</option>
            {partyOrder(state).map((p) => (
              <option key={p} value={p}>
                {state.parties[p].name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-small" disabled={!role || !party} onClick={() => role && actions.update((s) => assign(s, id, role, party))}>
            Place
          </button>
          <button type="button" className="text-btn" onClick={() => actions.remove(id)}>
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function PartyCard({ partyId, state, actions }: { partyId: string; state: AppState; actions: Actions }) {
  const party = state.parties[partyId];
  const pages = partyPages(state, partyId);
  const signed = signedFor(state, partyId);
  const stamps = stampsFor(state, partyId);
  const co = coParties(state, partyId);
  const needsStamp = party.copy !== "none" || stamps.length > 0;

  return (
    <article className="party-card" data-testid="party-card">
      <header className="party-head">
        <div>
          <h3>{party.name || "Unnamed party"}</h3>
          <p className="hint">
            Signs on p. {pages.map((p) => p + 1).join(", ")}
          </p>
        </div>
        <label className="copy-select">
          <span className="visually-hidden">Executed copy for {party.name}</span>
          <select
            value={party.copy}
            onChange={(e) => actions.update((s) => updateParty(s, partyId, { copy: e.target.value as CopyType }))}
          >
            <option value="original">Gets the original</option>
            <option value="counterpart">Gets a counterpart</option>
            <option value="none">No copy</option>
          </select>
        </label>
      </header>

      <div className="slot">
        <p className="slot-title">
          Countersigned page {signed.length ? <span className="ok">Received</span> : <span className="wait">Awaited</span>}
        </p>
        {signed.map((id) => (
          <FileChip key={id} id={id} state={state} actions={actions}>
            {co.length ? (
              <fieldset className="also">
                <legend>Also signed on this file by</legend>
                {co.map((other) => {
                  const place = state.placement[id];
                  const checked = place.role === "signed" && place.partyIds.includes(other);
                  return (
                    <label key={other}>
                      <input type="checkbox" checked={checked} onChange={() => actions.update((s) => toggleSignedParty(s, id, other))} />
                      {state.parties[other].name}
                    </label>
                  );
                })}
              </fieldset>
            ) : null}
          </FileChip>
        ))}
        <DropZone compact onFiles={(f) => void actions.addFiles(f, { role: "signed", partyId })} accept={ACCEPT} label={`Add countersigned page from ${party.name}`}>
          <span>+ Countersigned page</span>
        </DropZone>
      </div>

      {needsStamp ? (
        <div className="slot">
          <p className="slot-title">
            Stamp paper {stamps.length ? <span className="ok">Received</span> : <span className="wait">Awaited</span>}
          </p>
          {stamps.map((id, i) => (
            <FileChip key={id} id={id} state={state} actions={actions}>
              {stamps.length > 1 ? (
                <span className="order-btns">
                  <button type="button" className="icon-btn" disabled={i === 0} aria-label="Move up" onClick={() => actions.update((s) => moveStamp(s, id, -1))}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" disabled={i === stamps.length - 1} aria-label="Move down" onClick={() => actions.update((s) => moveStamp(s, id, 1))}>
                    ↓
                  </button>
                </span>
              ) : null}
            </FileChip>
          ))}
          <DropZone compact onFiles={(f) => void actions.addFiles(f, { role: "stamp", partyId })} accept={ACCEPT} label={`Add stamp paper for ${party.name}`}>
            <span>+ Stamp paper</span>
          </DropZone>
        </div>
      ) : null}
    </article>
  );
}

function FileChip({ id, state, actions, children }: { id: string; state: AppState; actions: Actions; children?: React.ReactNode }) {
  const meta = state.meta[id];
  return (
    <div className="chip">
      <img className="file-thumb" src={meta.thumb} alt="" style={{ transform: `rotate(${meta.rotation}deg)` }} />
      <div className="chip-body">
        <p className="file-name">{meta.fileName}</p>
        <p className="hint">
          {meta.pageCount} page{meta.pageCount === 1 ? "" : "s"}
          {meta.rotation ? ` · rotated ${meta.rotation}°` : ""}
        </p>
        <div className="chip-actions">
          <button type="button" className="text-btn" onClick={() => actions.update((s) => rotateAttachment(s, id))}>
            Rotate
          </button>
          <button type="button" className="text-btn" onClick={() => actions.update((s) => unassign(s, id))}>
            Move
          </button>
          <button type="button" className="text-btn" onClick={() => actions.remove(id)}>
            Remove
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
