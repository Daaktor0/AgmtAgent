/**
 * Agmt brand tokens. The single source the product app may import later.
 * Nothing here is site-specific: no layout, no copy, no routes.
 */

export const brand = {
  name: "Agmt",
  /** Two-letter mark used where the full wordmark will not fit. */
  mark: "Ag",
  tagline: "Proof the artefact. Review the deal.",
  /**
   * Paper and ink, with one accent. Oxblood, not green: the product's output
   * is markup on a document, and red is the colour a document gets marked in.
   */
  colors: {
    paper: "#faf8f4",
    paperSunk: "#f1ede4",
    card: "#fffefb",
    ink: "#191612",
    ink2: "#3b352c",
    muted: "#6c6558",
    faint: "#9a9285",
    rule: "#ded7c8",
    ruleStrong: "#c5bcaa",
    accent: "#7a1c1c",
    accentHover: "#5e1414",
    accentInk: "#fdfbf7",
    accentSoft: "#f6ebe8",
  },
  fonts: {
    /** Wordmark and headings. */
    serif: '"Spectral", "Iowan Old Style", Georgia, serif',
    /** Body. */
    sans: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
    /** Seat numbers, counters, statuses — anything that must line up. */
    mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace',
  },
} as const;

/**
 * Seats a visitor can take on a first-come basis.
 *
 * These two numbers are also written into the check constraints in
 * migrations/0002_waitlist.sql. Change one and you must write a migration for
 * the other, or the database will refuse the seat the site just promised.
 */
export const SEAT_OPEN = 30;
/** Seats the founder allots by hand. Never filled by the site. */
export const SEAT_RESERVED = 20;
export const SEAT_TOTAL = SEAT_OPEN + SEAT_RESERVED;
