import enGbAff from "./en-GB.aff?raw";
import enGbDic from "./en-GB.dic?raw";
import enAff from "./en.aff?raw";
import enDic from "./en.dic?raw";

export function hunspellFiles(language: "en-GB" | "en-US"): { aff: string; dic: string } {
  if (language === "en-US") return { aff: enAff, dic: enDic };
  return { aff: enGbAff, dic: enGbDic };
}
