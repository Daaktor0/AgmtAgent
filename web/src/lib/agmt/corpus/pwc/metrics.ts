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
