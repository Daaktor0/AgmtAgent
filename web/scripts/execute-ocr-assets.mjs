/**
 * Serves the local text-recognition engine for executed copies from the app
 * itself at /execute-ocr/, never from a CDN: the Tesseract worker, its WASM
 * cores (LSTM builds only) and the English model. Dev: a middleware reads
 * them from node_modules. Build: they are emitted into the client output.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export const EXECUTE_OCR_PREFIX = "/execute-ocr/";

export function executeOcrFiles() {
  const tesseract = dirname(require.resolve("tesseract.js/package.json"));
  const core = dirname(require.resolve("tesseract.js-core/package.json"));
  const eng = dirname(require.resolve("@tesseract.js-data/eng/package.json"));
  return {
    "worker.min.js": join(tesseract, "dist/worker.min.js"),
    "tesseract-core-lstm.wasm.js": join(core, "tesseract-core-lstm.wasm.js"),
    "tesseract-core-simd-lstm.wasm.js": join(core, "tesseract-core-simd-lstm.wasm.js"),
    "tesseract-core-relaxedsimd-lstm.wasm.js": join(core, "tesseract-core-relaxedsimd-lstm.wasm.js"),
    "eng.traineddata.gz": join(eng, "4.0.0_best_int/eng.traineddata.gz"),
  };
}

const TYPES = { ".js": "text/javascript; charset=utf-8", ".gz": "application/octet-stream" };

export function executeOcrAssets() {
  const files = executeOcrFiles();
  return {
    name: "agmt-execute-ocr-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?", 1)[0];
        if (!path.startsWith(EXECUTE_OCR_PREFIX)) return next();
        const name = path.slice(EXECUTE_OCR_PREFIX.length);
        const source = files[name];
        if (!source) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("content-type", TYPES[name.slice(name.lastIndexOf("."))] ?? "application/octet-stream");
        res.setHeader("cache-control", "public, max-age=86400");
        res.end(readFileSync(source));
      });
    },
    generateBundle() {
      // Only the browser build ships these; the Worker bundle never needs them.
      if (this.environment && this.environment.name !== "client") return;
      for (const [name, source] of Object.entries(files)) {
        this.emitFile({ type: "asset", fileName: `execute-ocr/${name}`, source: readFileSync(source) });
      }
    },
  };
}
