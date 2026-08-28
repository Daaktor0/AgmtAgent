import { FLOW } from "@/brand/copy";

/**
 * The path a pack takes. Drawn as a diagram on purpose: hairlines and labels,
 * no window chrome, no invented interface. Nothing here is a screenshot,
 * because there is nothing to screenshot yet.
 *
 * Wide on a desk, stacked on a phone — the same five stages either way.
 */
export function FlowDiagram() {
  return (
    <figure className="mt-8">
      <Horizontal />
      <Vertical />
      <figcaption className="mt-4 text-sm text-faint">
        A diagram of the path, not a picture of the product.
      </figcaption>
    </figure>
  );
}

const W = 900;
const PAD = 4;
const Y = 52;

function Horizontal() {
  const step = (W - PAD * 2) / (FLOW.length - 1);
  return (
    <svg
      viewBox={`0 0 ${W} 92`}
      className="hidden w-full sm:block"
      role="img"
      aria-label={FLOW.map((f) => `${f.step}: ${f.note}`).join(". Then ")}
    >
      <line x1={PAD} y1={Y} x2={W - PAD} y2={Y} stroke="var(--color-rule-strong)" strokeWidth="1" />
      {FLOW.map((item, i) => {
        const x = PAD + step * i;
        const anchor = i === 0 ? "start" : i === FLOW.length - 1 ? "end" : "middle";
        const dx = i === 0 ? -1 : i === FLOW.length - 1 ? 1 : 0;
        return (
          <g key={item.step}>
            <rect x={x - 3.5} y={Y - 3.5} width="7" height="7" fill="var(--color-accent)" />
            <text
              x={x + dx * 3}
              y={Y - 18}
              textAnchor={anchor}
              fill="var(--color-ink)"
              fontFamily="var(--font-serif)"
              fontSize="19"
            >
              {item.step}
            </text>
            <text
              x={x + dx * 3}
              y={Y + 26}
              textAnchor={anchor}
              fill="var(--color-muted)"
              fontFamily="var(--font-sans)"
              fontSize="13"
            >
              {item.note}
            </text>
          </g>
        );
      })}
      {FLOW.slice(0, -1).map((item, i) => {
        const mid = PAD + step * i + step / 2;
        return (
          <path
            key={`arrow-${item.step}`}
            d={`M ${mid - 3} ${Y - 4} L ${mid + 3} ${Y} L ${mid - 3} ${Y + 4}`}
            fill="none"
            stroke="var(--color-rule-strong)"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}

function Vertical() {
  return (
    <ol className="border-l border-rule-strong pl-5 sm:hidden">
      {FLOW.map((item) => (
        <li key={item.step} className="relative py-2.5">
          <span aria-hidden className="absolute -left-[23px] top-[1.15rem] size-[7px] bg-accent" />
          <p className="font-serif text-lg leading-tight text-ink">{item.step}</p>
          <p className="text-sm text-muted">{item.note}</p>
        </li>
      ))}
    </ol>
  );
}
