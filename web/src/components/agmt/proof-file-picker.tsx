import { useId, useRef } from "react";
import { interpretFileSelection } from "@/lib/products/proof-state";

export function ProofFilePicker({
  selected,
  error,
  disabled,
  onSelect,
  onError,
}: {
  selected: { name: string; size: number } | null;
  error: string | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
  onError: (message: string | null) => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function apply(list: File[]) {
    const interpreted = interpretFileSelection(list, selected);
    if (interpreted.error === "multiple_files") {
      onError("Choose one document at a time.");
      return;
    }
    if (interpreted.error === "wrong_extension") {
      onError("Choose a Word (.docx) file containing document text.");
      onSelect(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (interpreted.error === "too_large") {
      onError("This file exceeds the 25 MiB limit.");
      onSelect(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onError(null);
    onSelect(list[0] ?? null);
  }

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="block text-sm font-medium">Choose Word document</label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="block min-h-11 w-full text-sm file:mr-4 file:min-h-11 file:border file:border-ink file:bg-transparent file:px-4 file:py-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oxblood"
        onChange={(event) => apply(event.target.files ? [...event.target.files] : [])}
      />
      <div
        tabIndex={disabled ? -1 : 0}
        className="min-h-11 border border-dashed border-rule px-4 py-6 text-sm text-stone focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oxblood"
        onDragOver={(event) => { event.preventDefault(); }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled) return;
          apply([...event.dataTransfer.files]);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        Drop one Word document here, or use the file control above. The native picker remains the keyboard path.
      </div>
      <p className="text-sm text-stone">One native, unencrypted English .docx, up to 25 MiB.</p>
      {selected ? <p className="break-words text-sm" aria-live="polite">{selected.name} · {(selected.size / 1024).toFixed(1)} KiB selected on your device</p> : null}
      {error ? <p id={errorId} role="alert" className="text-sm text-oxblood">{error}</p> : null}
    </div>
  );
}
