import type { ProofPresentation } from "@/lib/products/proof-state";

const KIND_LABEL = {
  checked: "Checked",
  skipped: "Not checked",
  not_applicable: "Not applicable",
} as const;

export function ProofCoverage({ view }: { view: ProofPresentation }) {
  if (!view.coverageLines.length) return null;
  return (
    <section className="space-y-3" aria-labelledby="proof-coverage-heading">
      <h2 id="proof-coverage-heading" className="font-display text-2xl">Coverage</h2>
      <ul className="space-y-2 text-sm leading-6">
        {view.coverageLines.map((line) => (
          <li key={`${line.kind}:${line.text}`}>
            <span className="text-stone">{KIND_LABEL[line.kind]} · </span>
            {line.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
