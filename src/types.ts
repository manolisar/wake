// Domain types for Voyage Speed Tracker.
//
// A Leg is one row in the table. `type` drives which fields are meaningful:
//   - 'Port'   — a port call: distance from previous port, ETA/Arr/Dep/FAW, etc.
//   - 'Sea'    — an at-sea day (a date carrier; no speed math of its own)
//   - 'Tender' — an anchorage/tender call (behaves like a port for the math)
//
// `mode` selects the solve direction for a port leg:
//   - 'speed' — operator enters the times, the app computes Speed (kn)
//   - 'time'  — operator enters a target Speed, the app computes the ETA
//
// All time fields are 'HH:MM' strings (24h). `utc` is the signed offset hours
// as a string (e.g. '-4'). `openLoop` / `seaCond` are HH:MM durations.

export type LegType = 'Port' | 'Sea' | 'Tender';
export type LegMode = 'speed' | 'time';

export interface Leg {
  type: LegType;
  date: string; // YYYY-MM-DD
  port: string;
  dist: string; // nautical miles, numeric string
  mode: LegMode;
  eta: string; // HH:MM (input in speed mode)
  arr: string; // HH:MM
  dep: string; // HH:MM
  faw: string; // HH:MM — Full Away
  sunrise: string; // HH:MM
  sunset: string; // HH:MM
  utc: string; // signed hours, e.g. '-4'
  openLoop: string; // HH:MM duration
  seaCond: string; // HH:MM duration
  stbyArrDist: string; // nm covered during arrival St/By (pilot/ETA → berth/Arr)
  stbyDepDist: string; // nm covered during departure St/By (berth/Dep → FAW)
  remarks: string;
  speed: string; // kn target (input in time mode)
}

export interface Version {
  action: string; // 'Created' | 'Locked' | 'Unlocked' | …
  by: string;
  note: string;
  at: string; // 'YYYY-MM-DD HH:MM'
}

export interface Voyage {
  id: string;
  number: string; // 3-digit voyage/cruise number — shown as "586 — Title"
  title: string; // product / itinerary name (e.g. "British Isles & Ireland")
  ended: boolean;
  locked: boolean;
  loggedBy: string;
  legs: Leg[];
  versions: Version[];
}

export type VoyageMap = Record<string, Voyage>;

// Filter pills in the sidebar.
export type Filter = 'all' | 'active' | 'ended' | 'locked';

// On-disk JSON bundle (v8 philosophy — JSON is the record). One bundle per ship.
export interface Bundle {
  bundleVersion: number;
  app: string;
  shipId: string;
  exportedAt: string;
  selectedId: string;
  voyages: VoyageMap;
}

// ── Fleet & roles (Solstice-class, mirrors Voyage Tracker v8) ────────────
export type ShipCode = 'SL' | 'EQ' | 'EC' | 'SI' | 'RF';

export interface Ship {
  code: ShipCode;
  name: string;
  built: number;
}

// Bridge/engine roles. `Marine` is view-only; everyone else may edit.
export type Role = 'admin' | 'master' | 'navigation' | 'environmental' | 'marine';

// The signed-in operator. Ship is no longer part of identity — the chosen
// folder drives all content; each .json carries its own shipId for display.
export interface Session {
  name: string;
  role: Role;
}
