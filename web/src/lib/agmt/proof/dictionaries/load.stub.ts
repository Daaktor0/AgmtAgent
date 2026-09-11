/** Server/Worker host does not run dictionary spelling. Browser worker loads the lists. */
export function hunspellFiles(_language: "en-GB" | "en-US"): { aff: string; dic: string } {
  throw new Error("incomplete_spelling_dictionary");
}
