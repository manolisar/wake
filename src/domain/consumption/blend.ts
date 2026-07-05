// Open-loop / close-loop hour splitting and fuel blending, extracted from
// ~/Projects/voyage-planner/src/components/planner/SeaLegPlanner.tsx (the
// helpers were pure — they only happened to live in a component there).

import type { CalculationResult } from './types';

/**
 * DG4 fuel changeover time per leg. Legs start and end in close-loop water (ports
 * and the prior leg are CL by company policy), so an open-loop window sits inside
 * the leg bracketed by one set of changeovers: 1 h MGO→HFO entering the open-loop
 * window + 1 h HFO→MGO returning to close-loop = 2 h. During a changeover hour DG4
 * burns 50% HFO / 50% MGO, modelled as a 50/50 blend of the open and close
 * results. These hours are drawn from the open-loop allocation (e.g. 10 h OL →
 * 8 h pure HFO + 2 h at 50/50). A leg with several crossings is still charged a
 * single set — finer granularity isn't worth it for planning.
 */
export const CHANGEOVER_HOURS_PER_LEG = 2;

export interface LegHourSplit {
  /** Open-loop hours burning DG4's set fuel at full rate. */
  pureOpen: number;
  /** Changeover hours at 50% open / 50% close. */
  changeover: number;
  /** Close-loop hours with DG4 on MGO at full rate. */
  pureClose: number;
}

/** Split a leg's hours into pure-open / changeover / pure-close portions. */
export function splitLegHours(hours: number, openLoopHours: number | undefined): LegHourSplit {
  const ol = openLoopHours === undefined ? hours : Math.min(Math.max(openLoopHours, 0), hours);
  const cl = hours - ol;
  // Changeovers only happen when the leg actually crosses between regimes.
  const changeover = ol > 0 && cl > 0 ? Math.min(CHANGEOVER_HOURS_PER_LEG, ol) : 0;
  return { pureOpen: ol - changeover, changeover, pureClose: cl };
}

export interface BlendedLegFuel {
  hfoMT: number;
  mgoMT: number;
  lsfoMT: number;
  totalMT: number;
}

/**
 * Blend a leg's fuel across open-loop, changeover, and close-loop hours.
 * `openLoopHours` undefined → whole leg uses the default (open) result.
 */
export function blendLegFuel(
  open: CalculationResult,
  close: CalculationResult,
  hours: number,
  openLoopHours: number | undefined
): BlendedLegFuel {
  const { pureOpen, changeover, pureClose } = splitLegHours(hours, openLoopHours);
  const blend = (openRate: number, closeRate: number) =>
    openRate * pureOpen + closeRate * pureClose + 0.5 * (openRate + closeRate) * changeover;
  const hfoMT = blend(open.hfoRate, close.hfoRate);
  const mgoMT = blend(open.mgoRate, close.mgoRate);
  const lsfoMT = blend(open.lsfoRate, close.lsfoRate);
  return { hfoMT, mgoMT, lsfoMT, totalMT: hfoMT + mgoMT + lsfoMT };
}
