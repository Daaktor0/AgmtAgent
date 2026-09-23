import { useRef, useState, type ReactNode } from "react";

/** A drop target that is also a button, so it works by keyboard and on touch. */
export function DropZone({
  onFiles,
  accept,
  multiple = true,
  compact = false,
  label,
  children,
  testId,
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  compact?: boolean;
  label: string;
  children?: ReactNode;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={`drop${compact ? " drop-compact" : ""}${over ? " drop-over" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      data-testid={testId}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
    >
      {children ?? <span>{label}</span>}
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
