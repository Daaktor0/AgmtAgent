import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function hunspellFiles(language: "en-GB" | "en-US"): { aff: string; dic: string } {
  if (!import.meta.url) throw new Error("incomplete_spelling_dictionary");
  const dir = dirname(fileURLToPath(import.meta.url));
  const prefix = language === "en-US" ? "en" : "en-GB";
  return {
    aff: readFileSync(join(dir, `${prefix}.aff`), "utf8"),
    dic: readFileSync(join(dir, `${prefix}.dic`), "utf8"),
  };
}
