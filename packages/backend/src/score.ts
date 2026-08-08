/** PRD §4.1 compliance score + freeze multiplier 0.35 for 88→31 demo */

export type ScoreInputs = {
  address: string;
  tenureDays: number;
  cleanScreeningEvents: number;
  totalScreeningEvents: number;
  travelRuleCompleteTransfers: number;
  crossBorderTransfers: number;
  frozen: boolean;
  requestIds?: string[];
};

export type ScoreResult = {
  tenureNorm: number;
  ccpCleanRate: number;
  trComplete: number;
  rawScore: number;
  score: number;
  band: "full" | "partial" | "significant" | "suspended";
  yieldPaidBps: number;
  yieldEscrowBps: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function computeScore(input: ScoreInputs): ScoreResult {
  const tenureNorm = clamp(Math.round((100 * input.tenureDays) / 365), 0, 100);
  const ccpCleanRate =
    input.totalScreeningEvents === 0
      ? 100
      : Math.round((100 * input.cleanScreeningEvents) / input.totalScreeningEvents);
  const trComplete =
    input.crossBorderTransfers === 0
      ? 100
      : Math.round(
          (100 * input.travelRuleCompleteTransfers) / input.crossBorderTransfers,
        );

  const rawScore = Math.round(0.4 * tenureNorm + 0.4 * ccpCleanRate + 0.2 * trComplete);
  const score = input.frozen ? Math.round(rawScore * 0.35) : rawScore;

  let band: ScoreResult["band"] = "suspended";
  let yieldPaidBps = 0;
  let yieldEscrowBps = 10_000;
  if (score >= 95) {
    band = "full";
    yieldPaidBps = 10_000;
    yieldEscrowBps = 0;
  } else if (score >= 80) {
    band = "partial";
    yieldPaidBps = 8500;
    yieldEscrowBps = 1500;
  } else if (score >= 70) {
    band = "significant";
    yieldPaidBps = 6000;
    yieldEscrowBps = 4000;
  }

  return {
    tenureNorm,
    ccpCleanRate,
    trComplete,
    rawScore,
    score,
    band,
    yieldPaidBps,
    yieldEscrowBps,
  };
}

/** Demo helper: construct inputs that yield rawScore 88, frozen → 31 */
export function demoInputs88(address: string, frozen = false): ScoreInputs {
  // 0.4*t + 0.4*c + 0.2*r = 88
  // Use tenureNorm=100, ccp=100, tr=40 → 40+40+8=88
  return {
    address,
    tenureDays: 365,
    cleanScreeningEvents: 10,
    totalScreeningEvents: 10,
    travelRuleCompleteTransfers: 2,
    crossBorderTransfers: 5,
    frozen,
    requestIds: ["demo-tenure", "demo-ccp", "demo-tr"],
  };
}
