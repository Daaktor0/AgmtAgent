import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A drop target that is also a button, so it works by keyboard and on touch. */
export function DropZone({
  onFiles,
  accept,
  multiple = true,
  label,
  children,
  className,
  testId,
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  label: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      data-testid={testId}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 border border-dashed border-rule-strong/60 bg-paper-sunk/40 px-6 text-center transition-colors duration-[var(--motion-quick)] hover:border-ink hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oxblood",
        over && "border-oxblood bg-paper-sunk",
        className,
      )}
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
      {children}
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
