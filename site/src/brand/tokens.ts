/** Shared Agmt brand tokens. */
export const brand = {
  name: "Agmt",
  mark: "Ag",
  tagline: "Proof the artefact. Review the deal.",
  colors: {
    paper: "#f3eee5",
    paperSunk: "#e7dfd2",
    card: "#fffaf0",
    ink: "#0b0d0f",
    ink2: "#25282d",
    muted: "#6d6961",
    faint: "#999187",
    rule: "#d7cec0",
    ruleStrong: "#b9ad9d",
    accent: "#9a2922",
    accentHover: "#7d201b",
    accentInk: "#fff8ef",
    accentSoft: "#ead6cf",
    brass: "#b48a52",
  },
  fonts: {
    serif: '"Spectral", "Iowan Old Style", Georgia, serif',
    sans: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace',
  },
} as const;

export const SEAT_OPEN = 30;
export const SEAT_RESERVED = 20;
export const SEAT_TOTAL = SEAT_OPEN + SEAT_RESERVED;
