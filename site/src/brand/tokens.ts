/**
 * Open Form design tokens. Source: Agmt-Brand-System.md §08 and the brand
 * kit's design-tokens.json. Values are the approved handoff, not sampled
 * from any mockup screenshot.
 */
export const brand = {
  name: "Agmt",
  domain: "agmt.legal",
  appUrl: "https://app.agmt.legal",
  colors: {
    plum: "#292331",
    plumHover: "#40364C",
    plumActive: "#1F1A26",
    chalk: "#F5F3ED",
    citron: "#D7F279",
    citronHover: "#CAE46D",
    white: "#FFFFFF",
    ash: "#625D68",
    rule: "#D7D2DB",
    iris: "#B8ADE8",
    mist: "#DDE5E9",
    deepSurface: "#352E3E",
    darkSecondary: "#C2BAC9",
    error: "#A12D3F",
    success: "#226448",
    warning: "#77500C",
  },
  fonts: {
    sans: '"Manrope", Arial, system-ui, sans-serif',
    specimen: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace',
  },
} as const;

/** Principal Proof launch CTAs point exactly here, in the same tab. */
export const APP_URL = brand.appUrl;
