/**
 * Build the claude.ai preview into dist-artifact/: the usual Vite build in
 * "artifact" mode, then page.html, the page body as a fragment (the viewer
 * supplies <!doctype>, <html>, <head> and <body> itself).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

execFileSync("npx", ["vite", "build", "--mode", "artifact"], { stdio: "inherit" });

const html = readFileSync("dist-artifact/index.html", "utf8");
const head = html.match(/<head>([\s\S]*)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const keep = head
  .split("\n")
  .filter((line) => !/<meta (charset|name="viewport")/.test(line))
  .join("\n");
writeFileSync("dist-artifact/page.html", `${keep.trim()}\n${body.trim()}\n`);
console.log("wrote dist-artifact/page.html");
