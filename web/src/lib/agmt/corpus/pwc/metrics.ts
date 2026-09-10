/**
 * Per-rule corpus metrics (PWC-14 / section 22).
 * Zero denominators are "not evaluated", never 100%.
 */
export type MetricStatus = "not_evaluated" | "evaluated";

export type RuleMetric = {
  ruleId: string;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number | null;
  recall: number | null;
  status: MetricStatus;
};

export function ruleMetric(input: {
  ruleId: string;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
}): RuleMetric {
  const precisionDenom = input.truePositive + input.falsePositive;
  const recallDenom = input.truePositive + input.falseNegative;
  return {
    ruleId: input.ruleId,
    truePositive: input.truePositive,
    falsePositive: input.falsePositive,
    falseNegative: input.falseNegative,
    precision: precisionDenom === 0 ? null : input.truePositive / precisionDenom,
    recall: recallDenom === 0 ? null : input.truePositive / recallDenom,
    status: precisionDenom === 0 && recallDenom === 0 ? "not_evaluated" : "evaluated",
  };
}

export function canPromote(metric: RuleMetric, floors: { precision: number; recall: number; minSamples: number }): boolean {
  if (metric.status === "not_evaluated") return false;
  const samples = metric.truePositive + metric.falsePositive + metric.falseNegative;
  if (samples < floors.minSamples) return false;
  if (metric.precision == null || metric.recall == null) return false;
  return metric.precision >= floors.precision && metric.recall >= floors.recall;
}

/** Wilson score interval. Observed 100% is not evidence that real-world precision exceeds a floor. */
export function wilsonInterval(successes: number, n: number, z = 1.959963984540054): { lower: number; upper: number } | null {
  if (n <= 0 || successes < 0 || successes > n) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = n + z2;
  const centre = (n * p + z2 / 2) / denom;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / denom);
  return { lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin) };
}
