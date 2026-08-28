/** Shared Agmt brand tokens. */
export const brand = {
  name: "Agmt",
  mark: "Ag",
  tagline: "Find what changed. Catch what broke.",
  colors: {
    paper: "#f5efe5",
    paperSunk: "#e9dfd0",
    card: "#fffaf1",
    ink: "#171c22",
    ink2: "#343b44",
    muted: "#6f6c66",
    faint: "#9b958b",
    rule: "#d9cfc0",
    ruleStrong: "#b8ab9a",
    accent: "#9b3028",
    accentHover: "#7c241f",
    accentInk: "#fff8ee",
    accentSoft: "#ecd7d0",
    brass: "#b8894a",
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
