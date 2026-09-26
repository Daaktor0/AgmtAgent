import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useModalFocus } from "./dialog";
import { useExecute } from "./execute-app";
import { useThumbnail } from "./thumbs";

/** One page shown large: a returned file, or a page of the final document. */
export type ViewedPage = { fileId: string; kind: "pdf" | "image"; page: number; label: string; rotation?: number };
type Viewing = { pages: ViewedPage[]; title: string };

const Ctx = createContext<(v: Viewing) => void>(() => undefined);

export const useViewPages = () => useContext(Ctx);

function Large({ p }: { p: ViewedPage }) {
  const { getBytes } = useExecute();
  const url = useThumbnail(p.fileId, p.kind, p.page, 1100, getBytes);
  return (
    <figure className="min-w-0 flex-1 space-y-2">
      <figcaption className="text-[11px] uppercase tracking-[0.14em] text-paper/80">{p.label}</figcaption>
      <div className="overflow-hidden bg-white">
        {url ? (
          <img src={url} alt={p.label} className="block w-full" style={{ transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined }} />
        ) : (
          <div className="thumb-loading aspect-[1/1.414] w-full" />
        )}
      </div>
    </figure>
  );
}

function Viewer({ viewing, onClose }: { viewing: Viewing; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref);
  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[60] overflow-y-auto bg-ink/[0.97] px-4 py-6 sm:px-10"
      role="dialog"
      aria-modal="true"
      aria-label={viewing.title}
      onClick={onClose}
    >
      <div className="mx-auto max-w-[1180px] space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 text-paper">
          <p className="font-display text-xl">{viewing.title}</p>
          <button type="button" onClick={onClose} className="px-1 text-2xl leading-none text-paper/80 hover:text-paper focus-visible:outline-2 focus-visible:outline-paper" aria-label="Close comparison">
            ×
          </button>
        </div>
        <div className="flex flex-col gap-6 md:flex-row">
          {viewing.pages.map((p) => (
            <Large key={`${p.fileId}:${p.page}`} p={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PageViewerProvider({ children }: { children: ReactNode }) {
  const [viewing, setViewing] = useState<Viewing | null>(null);
  useEffect(() => {
    if (!viewing) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setViewing(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [viewing]);
  return (
    <Ctx.Provider value={setViewing}>
      {children}
      {viewing ? <Viewer viewing={viewing} onClose={() => setViewing(null)} /> : null}
    </Ctx.Provider>
  );
}
