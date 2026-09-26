/**
 * Browser-only modules (pdf.js, OCR, IndexedDB) are loaded on first use, so
 * server rendering never touches them and the first paint stays light.
 */
export const loadIntake = () => import("@/lib/execute/browser/intake");
export const loadPdf = () => import("@/lib/execute/browser/pdf");
export const loadStore = () => import("@/lib/execute/browser/store");
export const loadSave = () => import("@/lib/execute/browser/save");
export const loadMake = () => import("@/lib/execute/browser/make");
