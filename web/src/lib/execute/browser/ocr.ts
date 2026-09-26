/**
 * Local text recognition for scans and phone photos (Tesseract, English).
 * The engine and the language model are served by Agmt itself from
 * /execute-ocr/ (see vite.config.ts); the page image never leaves the
 * browser. One worker is kept for the session and runs one page at a time.
 */
import { createWorker, OEM, type Worker } from "tesseract.js";

let worker: Promise<Worker> | null = null;

function assetBase(): string {
  return new URL("/execute-ocr/", window.location.origin).href;
}

function getWorker(): Promise<Worker> {
  worker ??= createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${assetBase()}worker.min.js`,
    corePath: assetBase(),
    langPath: assetBase(),
    workerBlobURL: false,
    gzip: true,
  }).catch((err: unknown) => {
    worker = null;
    throw err;
  });
  return worker;
}

let queue: Promise<unknown> = Promise.resolve();

/** Recognise the text on a drawn page. Calls are serialised. */
export function recognise(canvas: HTMLCanvasElement): Promise<string> {
  const run = queue.then(async () => {
    const w = await getWorker();
    const { data } = await w.recognize(canvas);
    return data.text ?? "";
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function stopOcr(): Promise<void> {
  const w = worker;
  worker = null;
  if (w) await (await w).terminate();
}
