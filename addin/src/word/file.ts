/**
 * Compressed DOCX slice acquisition with close.
 *
 * Adapted from Vaquill AI ms-word-addin (Apache-2.0) src/office/file.ts.
 * Modified: Agmt uses this for snapshot/export helpers only, not mutation.
 */
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function readCompressedBytes(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(
      Office.FileType.Compressed,
      { sliceSize: 65536 },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error(result.error?.message ?? "Could not read the document file."));
          return;
        }
        const file = result.value;
        const slices: Uint8Array[] = new Array(file.sliceCount);
        let done = false;
        const fail = (message: string) => {
          if (done) return;
          done = true;
          file.closeAsync(() => {});
          reject(new Error(message));
        };
        const finish = () => {
          const total = slices.reduce((n, s) => n + s.length, 0);
          const all = new Uint8Array(total);
          let offset = 0;
          for (const s of slices) {
            all.set(s, offset);
            offset += s.length;
          }
          file.closeAsync(() => {});
          done = true;
          resolve(all);
        };
        const getSlice = (index: number) => {
          if (done) return;
          file.getSliceAsync(index, (sliceResult) => {
            if (sliceResult.status !== Office.AsyncResultStatus.Succeeded) {
              fail(sliceResult.error?.message ?? "Could not read a slice of the document.");
              return;
            }
            const data = sliceResult.value.data as number[];
            slices[sliceResult.value.index] = new Uint8Array(data);
            if (index + 1 < file.sliceCount) getSlice(index + 1);
            else finish();
          });
        };
        getSlice(0);
      },
    );
  });
}

export async function readDocumentBlob(): Promise<{ blob: Blob; filename: string }> {
  const all = await readCompressedBytes();
  const copy = new Uint8Array(all.length);
  copy.set(all);
  return { blob: new Blob([copy], { type: DOCX_MIME }), filename: "document.docx" };
}
