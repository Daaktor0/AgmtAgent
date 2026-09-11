import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

export function hunspellFiles(language: "en-GB" | "en-US"): { aff: string; dic: string } {
  const prefix = language === "en-US" ? "en" : "en-GB";
  return {
    aff: readFileSync(join(dir, `${prefix}.aff`), "utf8"),
    dic: readFileSync(join(dir, `${prefix}.dic`), "utf8"),
  };
}
