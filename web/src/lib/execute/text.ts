/** Text normalisation and overlap scoring shared by sorting and checks. */

const STOP = new Set([
  "the", "and", "of", "to", "in", "on", "by", "for", "a", "an", "as", "at", "or", "its", "be", "is", "this",
  "that", "with", "from", "which", "all", "any", "such", "shall", "have", "has", "been", "day", "year",
]);

export function normaliseText(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower-case word tokens of two or more letters or digits, stop-words removed. */
export function tokens(raw: string): string[] {
  return normaliseText(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function tokenSet(raw: string): Set<string> {
  return new Set(tokens(raw));
}

/** Share of `needles` found in `haystack`. 0 when there is nothing to look for. */
export function recall(needles: Set<string>, haystack: Set<string>): number {
  if (needles.size === 0) return 0;
  let hit = 0;
  for (const t of needles) if (haystack.has(t)) hit += 1;
  return hit / needles.size;
}

const NAME_NOISE = new Set([
  "private", "limited", "pvt", "ltd", "llp", "mr", "mrs", "ms", "dr", "inc", "llc", "co", "company", "m", "s",
]);

/** The words that identify a party: "Banyan Capital Fund I" -> banyan, capital, fund. */
export function nameTokens(name: string): Set<string> {
  return new Set(tokens(name).filter((t) => !NAME_NOISE.has(t) && !/^[ivx]+$/.test(t)));
}

/** How well a free-text name (from a stamp paper, say) matches a party name. */
export function nameMatch(partyName: string, text: string): number {
  return recall(nameTokens(partyName), tokenSet(text));
}
