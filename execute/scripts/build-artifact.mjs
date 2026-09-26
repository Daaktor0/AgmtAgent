/**
 * Build the claude.ai preview into dist-artifact/: the usual Vite build in
 * "artifact" mode, then
 *  - scripts re-printed with control characters escaped: the artifact store
 *    accepts only plain text, and pdf.js ships raw control bytes inside its
 *    string literals (same values, written as \x.. escapes);
 *  - page.html, the page body as a fragment (the viewer supplies
 *    <!doctype>, <html>, <head> and <body> itself).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { parse } from "@babel/parser";

execFileSync("node", ["node_modules/vite/bin/vite.js", "build", "--mode", "artifact"], { stdio: "inherit" });

const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
for (const name of readdirSync("dist-artifact/assets")) {
  if (!/\.m?js$/.test(name)) continue;
  const path = `dist-artifact/assets/${name}`;
  const code = readFileSync(path, "utf8");
  if (!CONTROL.test(code)) continue;
  let out = transformSync(code, { format: "esm", charset: "ascii", minifyWhitespace: true, target: "es2022" }).code;
  out = escapeTemplates(out, name);
  if (CONTROL.test(out)) throw new Error(`${name} still carries control characters`);
  writeFileSync(path, out);
  console.log(`escaped control characters in ${name}`);
}

const html = readFileSync("dist-artifact/index.html", "utf8");
const head = html.match(/<head>([\s\S]*)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const keep = head
  .split("\n")
  .filter((line) => !/<meta (charset|name="viewport")/.test(line))
  .join("\n");
writeFileSync("dist-artifact/page.html", `${keep.trim()}\n${body.trim()}\n`);
console.log("wrote dist-artifact/page.html");

/**
 * esbuild leaves some control characters raw: inside template literals
 * (escaping changes a template's `.raw` text) and in a few strings. In a
 * string, a regex or an untagged template the value is identical either
 * way, so escape them there; refuse if a tagged template (whose tag could
 * read `.raw`) carries one.
 */
function escapeTemplates(code, name) {
  if (!CONTROL.test(code)) return code;
  const ast = parse(code, { sourceType: "module", errorRecovery: false });
  const edits = [];
  (function walk(node, parent) {
    if (!node || typeof node.type !== "string") return;
    const literal = ["TemplateElement", "StringLiteral", "RegExpLiteral"].includes(node.type);
    if (literal && CONTROL.test(code.slice(node.start, node.end))) {
      if (node.type === "TemplateElement" && parent?.__tagged) {
        throw new Error(`${name}: a tagged template carries control characters; not rewriting it`);
      }
      edits.push([node.start, node.end]);
    }
    if (node.type === "TaggedTemplateExpression") node.quasi.__tagged = true;
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (key === "loc" || key === "extra") continue;
      if (Array.isArray(value)) value.forEach((child) => walk(child, node));
      else if (value && typeof value === "object") walk(value, node);
    }
  })(ast.program, null);
  let out = "";
  let at = 0;
  for (const [start, end] of edits.sort((a, b) => a[0] - b[0])) {
    out += code.slice(at, start);
    out += code.slice(start, end).replace(new RegExp(CONTROL.source, "g"), (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
    at = end;
  }
  return out + code.slice(at);
}
