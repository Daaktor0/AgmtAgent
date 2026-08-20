/**
 * Freshness signals only. Events are not document identity.
 *
 * Paragraph added/changed/deleted subscription idea adapted from Vaquill AI
 * ms-word-addin (Apache-2.0) changeEvents/watch. Modified: comments do not
 * fire; caller must debounce.
 */
export async function onDocumentChanged(cb: () => void): Promise<() => void> {
  const handlers: Array<() => void> = [];
  const fire = () => cb();
  const doc = Office.context.document as Office.Document & {
    addHandlerAsync?: (type: unknown, handler: () => void) => void;
    removeHandlerAsync?: (type: unknown, opts: { handler: () => void }) => void;
  };
  const types = [
    (Office as unknown as { EventType?: Record<string, unknown> }).EventType,
  ][0];
  if (types && (types as { DocumentSelectionChanged?: unknown }).DocumentSelectionChanged) {
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, fire);
    handlers.push(() => {
      Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler: fire });
    });
  }
  try {
    await Word.run(async (context) => {
      const ev = context.document as Word.Document & {
        onParagraphAdded?: { add: (h: () => void) => void; remove: (h: () => void) => void };
        onParagraphChanged?: { add: (h: () => void) => void; remove: (h: () => void) => void };
        onParagraphDeleted?: { add: (h: () => void) => void; remove: (h: () => void) => void };
      };
      if (ev.onParagraphAdded) {
        ev.onParagraphAdded.add(fire);
        ev.onParagraphChanged?.add(fire);
        ev.onParagraphDeleted?.add(fire);
        await context.sync();
        handlers.push(() => {
          try {
            ev.onParagraphAdded?.remove(fire);
            ev.onParagraphChanged?.remove(fire);
            ev.onParagraphDeleted?.remove(fire);
          } catch {
            /* guarded cleanup */
          }
        });
      }
    });
  } catch {
    /* selection-changed fallback already registered */
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    handlers.forEach((h) => {
      try {
        h();
      } catch {
        /* guarded */
      }
    });
  };
}
