// Consumption-engine types, ported from the SL Class Voyage Planner
// (~/Projects/voyage-planner/src/types/index.ts) plus the shapes this app adds
// for defaults/overrides and the per-voyage consumption snapshot.
//
// Framework-free, like everything under src/domain/.

export type FuelType = 'HFO' | 'MGO' | 'LSFO';

export interface EngineConfig {
  id: number;
  label: string;
  mgoLocked: boolean;
  allowedFuels: FuelType[];
  /** Open-loop scrubber only — in close-loop waters this DG cannot burn HFO. */
  openLoopOnly?: boolean;
}

export interface EngineState {
  id: number;
  available: boolean;
  fuel: FuelType;
}

export interface EngineResult {
  id: number;
  status: 'RUNNING' | 'STANDBY' | 'OFFLINE';
  loadKW: number;
  loadFraction: number;
  loadLimit: number;
  overloaded: boolean;
  fuelConsumption: number;
  fuel: FuelType;
}

/** The subset the ported engine functions consume (mirrors VesselSettings). */
export interface VesselSettings {
  hotelLoad: number;
  seaMargin: number;
  sfocDet: number;
  propAux: number;
}

export interface CalculationResult {
  propPowerKW: number;
  totalPowerKW: number;
  avgLoadPercent: number;
  engineResults: EngineResult[];
  hfoRate: number;
  mgoRate: number;
  lsfoRate: number;
  totalRate: number;
  insufficient: boolean;
  numRunning: number;
  numAvailable: number;
  hfoRunning: number;
  mgoRunning: number;
  lsfoRunning: number;
}

// ── Settings: ship defaults + per-voyage overrides ────────────────────────

export interface PortSetup {
  engineCount: number;
  fuelType: FuelType;
}

export interface TenderSetup {
  /** Total plant output while tendering (hotel + tender ops).
   *  CE-validated 2026-07-07: 11,000 kW on 2 DGs. */
  totalPowerKW: number;
  engineCount: number;
  fuelType: FuelType;
}

export interface StbySetup {
  /** Fallback TOTAL plant power when a St/By phase has no distance data. */
  avgPowerMW: number;
  engineCount: number;
  fuelType: FuelType;
}

/** The full parameter set the calculation runs with (a resolved snapshot). */
export interface ConsumptionSettings extends VesselSettings {
  engines: EngineState[]; // 4 DGs: availability + fuel
  port: PortSetup;
  tender: TenderSetup;
  stby: StbySetup;
  /**
   * Thruster/steering load (kW) during the St/By idle period — the whole
   * phase except the final 30 minutes. CE-validated 2026-07-07: 3 × 360 kW.
   * Added on top of trial-curve propulsion for speed-derived St/By phases —
   * the curve only knows the propeller, not maneuvering gear.
   */
  thrusterIdleKW: number;
  /**
   * Thruster output (kW) during the final 30 minutes of a St/By phase
   * (docking/undocking). CE-validated 2026-07-07: 3 × 3,000 kW.
   */
  thrusterHighKW: number;
}

/** Per-voyage overrides; anything unset falls through to the ship defaults. */
export interface ConsumptionOverrides {
  hotelLoad?: number;
  seaMargin?: number;
  sfocDet?: number;
  propAux?: number;
  thrusterIdleKW?: number;
  thrusterHighKW?: number;
  engines?: EngineState[]; // whole-array override (all 4 DGs)
  port?: Partial<PortSetup>;
  tender?: Partial<TenderSetup>;
  stby?: Partial<StbySetup>;
}

// ── Results: per-phase, per-leg, per-voyage ───────────────────────────────

export interface PhaseConsumption {
  hours: number;
  hfoMT: number;
  mgoMT: number;
  lsfoMT: number;
  totalMT: number;
  insufficient: boolean;
}

export interface SeaPhase extends PhaseConsumption {
  speed: number;
  /** Hours in open-loop waters (undefined = whole passage open-loop). */
  openLoopHours?: number;
  changeoverHours: number;
  /** Sailing boiler burn (MGO), folded into mgoMT/totalMT. Absent in
   *  snapshots persisted before the sailing-boiler assumption (2026-07-07). */
  boilerMT?: number;
  /** DG breakdown with the set fuels (open-loop regime). */
  openResult: CalculationResult;
  /** DG breakdown with DG4 forced to MGO — present when the leg splits. */
  closeResult?: CalculationResult;
}

export type StbyPowerSource = 'speed' | 'default' | 'override';

export interface StbyPhase extends PhaseConsumption {
  source: StbyPowerSource;
  /** Maneuvering speed (kn) when source === 'speed'. */
  speed?: number;
  powerKW: number;
  engineCount: number;
  fuelType: FuelType;
  /** DGs brought online on MGO beyond the configured St/By count because the
   *  load needed them (CE assumption: a 3rd engine runs MGO). Absent in
   *  snapshots persisted before 2026-07-07. */
  extraMgoEngines?: number;
}

export interface PortPhase extends PhaseConsumption {
  boilerMT: number;
  /** DG (hotel load) rate, t/h — boiler excluded. */
  dgRate: number;
  /** True when this stay ran on the tender assumptions (Type: Tender leg —
   *  fixed total output on the tender DG count). Absent for normal port
   *  stays and in snapshots persisted before 2026-07-07. */
  tender?: boolean;
}

export interface LegConsumption {
  legIndex: number;
  port: string;
  date: string;
  sea?: SeaPhase;
  stbyArr?: StbyPhase;
  stbyDep?: StbyPhase;
  portStay?: PortPhase;
}

export interface ConsumptionTotals {
  hfoMT: number;
  mgoMT: number;
  lsfoMT: number;
  totalMT: number;
  seaHrs: number;
  stbyHrs: number;
  portHrs: number;
  boilerMT: number;
}

/** The snapshot persisted on a Voyage after "Calculate Consumption". */
export interface VoyageConsumption {
  computedAt: string; // ISO timestamp
  by: string;
  /** Resolved settings the run used — makes the result reproducible. */
  settings: ConsumptionSettings;
  /** Signature of the consumption-relevant inputs — staleness detection. */
  inputSignature: string;
  legs: LegConsumption[];
  totals: ConsumptionTotals;
  warnings: string[];
}
