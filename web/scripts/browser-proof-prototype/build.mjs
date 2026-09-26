import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "..");
const distDir = join(here, "dist");
const require = createRequire(join(repoRoot, "package.json"));
const esbuild = require("esbuild");
const webRequire = createRequire(join(webRoot, "package.json"));

const shims = {
  crypto: join(here, "shims/crypto.ts"),
  assert: join(here, "shims/assert.ts"),
  zlib: join(here, "shims/zlib.ts"),
  agmtCrypto: join(here, "shims/agmt-crypto.ts"),
};

const forbidden = [
  "runtime-env.server",
  "proof-service",
  "proof-antivirus",
  "proof-budget",
  "resend",
  "better-auth",
  "node:fs",
  "node:child_process",
  "node:net",
  "node:http",
  "node:https",
  "pg/",
  "kysely",
  "ProofValidator",
  "DocumentFormat.OpenXml",
];

function isAgmtCrypto(resolved) {
  const norm = resolved.split(/[/\\]/).join("/");
  return norm.endsWith("/src/lib/agmt/crypto.ts");
}

export async function buildBrowserProofPrototype() {
  await mkdir(distDir, { recursive: true });
  const result = await esbuild.build({
    absWorkingDir: webRoot,
    entryPoints: [join(here, "browser-entry.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    outfile: join(distDir, "browser-proof.js"),
    sourcemap: false,
    metafile: true,
    logLevel: "silent",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    alias: {
      "node:crypto": shims.crypto,
      "node:assert/strict": shims.assert,
      "node:assert": shims.assert,
      "node:zlib": shims.zlib,
    },
    plugins: [
      {
        name: "agmt-browser-prototype-guards",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.path.startsWith("node:") && !["node:crypto", "node:assert", "node:assert/strict", "node:zlib"].includes(args.path)) {
              return { errors: [{ text: `forbidden Node builtin in browser prototype: ${args.path}` }] };
            }
            if (forbidden.some((part) => args.path.includes(part))) {
              return { errors: [{ text: `forbidden module in browser prototype: ${args.path}` }] };
            }
          });
          build.onResolve({ filter: /crypto\.ts$/ }, (args) => {
            const resolved = args.path.endsWith(".ts") && (args.path.includes("/") || args.path.includes("\\") || args.path.startsWith("."))
              ? join(args.resolveDir, args.path)
              : args.path;
            if (isAgmtCrypto(resolved) || isAgmtCrypto(join(args.resolveDir, args.path))) {
              return { path: shims.agmtCrypto };
            }
          });
        },
      },
    ],
  });

  const inputs = Object.keys(result.metafile.inputs).map((file) => file.split(/[/\\]/).join("/"));
  const leaked = inputs.filter((file) => forbidden.some((part) => file.includes(part)));
  if (leaked.length) {
    throw new Error(`browser prototype leaked forbidden files: ${leaked.join(", ")}`);
  }
  if (inputs.some((file) => file.endsWith("/src/lib/agmt/crypto.ts"))) {
    throw new Error("browser prototype bundled production envelope crypto");
  }

  const bytes = Buffer.byteLength(JSON.stringify(result.metafile));
  void bytes;
  const outfile = join(distDir, "browser-proof.js");
  const { statSync } = await import("node:fs");
  const bundleBytes = statSync(outfile).size;
  const pakoPath = webRequire.resolve("pako/package.json");
  const report = {
    bundleBytes,
    inputCount: inputs.length,
    pako: relative(webRoot, pakoPath).split(sep).join("/"),
    leaked,
    usedShims: true,
  };
  await writeFile(join(distDir, "metafile.json"), JSON.stringify({ report, inputs }, null, 2));
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = await buildBrowserProofPrototype();
  console.log(JSON.stringify(report, null, 2));
}
