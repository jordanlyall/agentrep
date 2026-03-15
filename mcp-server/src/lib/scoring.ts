export interface ReputationData {
  erc8004Count: number;
  erc8004Sum: number;
  easCount: number;
  easSum: number;
}

export interface TrustScore {
  unified: number | null;
  erc8004: { count: number; average: number | null };
  eas: { count: number; average: number | null };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeTrustScore(data: ReputationData): TrustScore {
  const erc8004Avg = data.erc8004Count > 0
    ? clamp(data.erc8004Sum / data.erc8004Count, 0, 100)
    : null;

  const easAvg = data.easCount > 0
    ? clamp(data.easSum / data.easCount, 0, 100)
    : null;

  let unified: number | null = null;

  if (erc8004Avg !== null && easAvg !== null) {
    unified = Math.round(0.6 * erc8004Avg + 0.4 * easAvg);
  } else if (erc8004Avg !== null) {
    unified = Math.round(erc8004Avg);
  } else if (easAvg !== null) {
    unified = Math.round(easAvg);
  }

  return {
    unified,
    erc8004: { count: data.erc8004Count, average: erc8004Avg !== null ? Math.round(erc8004Avg) : null },
    eas: { count: data.easCount, average: easAvg !== null ? Math.round(easAvg) : null },
  };
}
