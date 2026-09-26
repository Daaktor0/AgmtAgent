/**
 * The security policy for the executed-copies page. Documents are opened in
 * this page, so it may run only Agmt's own code and may connect only to Agmt
 * itself: no third-party script (the template's platform script included)
 * can load, and nothing in the page can send a document elsewhere.
 * 'wasm-unsafe-eval' lets the local OCR and PDF engines run WebAssembly.
 * Fonts are the only outside resource, from Google Fonts.
 */
const DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' blob: data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  // Agmt is a website, not an app to install: no web manifest may load.
  "manifest-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

/** As a <meta http-equiv> (frame-ancestors is ignored there, so it is left out). */
export const EXECUTE_CSP_META = DIRECTIVES.join("; ");

/** As the HTTP header the Worker sends with the page. */
export const EXECUTE_CSP_HEADER = [...DIRECTIVES, "frame-ancestors 'self'"].join("; ");

/**
 * Pages that get the policy: the tool itself, and the account and decision
 * pages, where passwords are typed and the founder approves people.
 */
export function isExecutePage(pathname: string): boolean {
  return pathname === "/" || pathname === "/join" || pathname === "/reset-password" || pathname.startsWith("/access/");
}
