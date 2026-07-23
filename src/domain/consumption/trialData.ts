// Solstice-class FAT trial curves, ported verbatim from
// ~/Projects/voyage-planner/src/data/trialData.ts.

export const trialData = [
  { speed: 0, power: 0 },
  { speed: 1, power: 571 },
  { speed: 2, power: 1071 },
  { speed: 3, power: 1071 },
  { speed: 4, power: 1572 },
  { speed: 5, power: 2076 },
  { speed: 6, power: 2581 },
  { speed: 7, power: 3088 },
  { speed: 8, power: 3590 },
  { speed: 9, power: 4077 },
  { speed: 10, power: 4564 },
  { speed: 11, power: 5539 },
  { speed: 12, power: 6514 },
  { speed: 13, power: 7497 },
  { speed: 14, power: 8977 },
  { speed: 15, power: 10956 },
  { speed: 16, power: 12444 },
  { speed: 17, power: 14932 },
  { speed: 18, power: 17724 },
  { speed: 19, power: 20196 },
  { speed: 20, power: 23169 },
  { speed: 21, power: 27149 },
  { speed: 22, power: 30921 },
  { speed: 23, power: 34888 },
  { speed: 24, power: 39865 },
  { speed: 25, power: 49158 },
];

// SFOC curve on an ENERGY (ISO 3046/1) basis — the FAT ISO-corrected column for
// engine PAAE072242 (16V46CR), referenced to 42.7 MJ/kg (REF_LHV_MJ_KG). This is
// the fuel-independent efficiency curve; as-burned g/kWh per leg is this value
// scaled by REF_LHV / fuelLHV in computePlantConsumption. Replaces the old
// voyage-planner curve (FAT *measured*, single-fuel) — see CLAUDE.md §8. The 0.40
// node lies on the 0.25→0.50 line (kept for shape; a no-op for interpolation).
export const sfocPoints = [
  { load: 0.25, sfoc: 201.34 },
  { load: 0.4, sfoc: 195.46 },
  { load: 0.5, sfoc: 191.54 },
  { load: 0.75, sfoc: 183.21 },
  { load: 0.85, sfoc: 179.89 },
  { load: 1.0, sfoc: 186.85 },
];

export const NOMINAL_KW = 16800;
