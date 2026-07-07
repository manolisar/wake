// JSON bundle build + parse — the on-disk record. Shape and the permissive
// single-voyage import idea mirror v8's storage/local/exportImport.ts.
//
// Bundle shape (intentionally flat):
// {
//   "bundleVersion": 1,
//   "app": "voyage-speed-planner-sl",
//   "exportedAt": "2026-06-25T12:34:56Z",
//   "selectedId": "586",
//   "voyages": { "586": { id, title, legs: [...], ... }, ... }
// }
import type { Bundle, Leg, LegType, Voyage, VoyageMap } from '../types';
import type { ConsumptionSettings, VoyageConsumption } from '../domain/consumption/types';
import { normalizeOverrides, normalizeSettings } from '../domain/consumption/settings';

// v2 adds consumption: per-file defaults, per-voyage overrides + snapshot.
// v1 files (pre-consumption) still parse — the new fields are simply absent.
export const BUNDLE_VERSION = 2;
const ACCEPTED_VERSIONS = new Set([1, 2]);
export const APP_ID = 'voyage-speed-planner-sl';
// 25 MB guard so a malformed/hostile file can't OOM the tab on JSON.parse.
const MAX_BYTES = 25 * 1024 * 1024;

export function buildBundle(
  voyages: VoyageMap,
  selectedId: string,
  shipId = '',
  consumptionDefaults?: ConsumptionSettings
): Bundle {
  return {
    bundleVersion: BUNDLE_VERSION,
    app: APP_ID,
    shipId,
    exportedAt: new Date().toISOString(),
    selectedId,
    voyages,
    ...(consumptionDefaults ? { consumptionDefaults } : null),
  };
}

function looksLikeVoyage(o: unknown): o is Voyage {
  if (!o || typeof o !== 'object') return false;
  return Array.isArray((o as Record<string, unknown>).legs);
}

/**
 * Parse + structurally validate a bundle string. Accepts either:
 *   1. A full bundle ({ bundleVersion, voyages: {…} }).
 *   2. A single-voyage JSON (has a `legs` array) — wrapped on the fly so the
 *      app can import a hand-copied voyage file.
 * Throws with a useful message on anything else.
 */
export function parseBundle(text: string): Bundle {
  if (text.length > MAX_BYTES) {
    throw new Error(`File is too large (max ${MAX_BYTES / (1024 * 1024)} MB).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('File root must be an object');
  }
  const p = parsed as Record<string, unknown>;

  // Permissive path: a bare single voyage.
  if (p.bundleVersion == null && looksLikeVoyage(p)) {
    const v = p as unknown as Voyage;
    const id = typeof v.id === 'string' && v.id ? v.id : 'imported';
    return buildBundle({ [id]: normalizeVoyage(v, id) }, id);
  }

  if (!ACCEPTED_VERSIONS.has(p.bundleVersion as number)) {
    throw new Error(
      `Unsupported file: expected bundleVersion 1–${BUNDLE_VERSION} or a single voyage JSON ` +
        `(with a \`legs\` array); got bundleVersion ${String(p.bundleVersion)}`,
    );
  }
  if (!p.voyages || typeof p.voyages !== 'object' || Array.isArray(p.voyages)) {
    throw new Error('Bundle.voyages must be an object map');
  }
  const src = p.voyages as Record<string, unknown>;
  const voyages: VoyageMap = {};
  for (const [id, vo] of Object.entries(src)) {
    if (!looksLikeVoyage(vo)) {
      throw new Error(`Voyage ${id} is missing a legs array`);
    }
    voyages[id] = normalizeVoyage(vo as Voyage, id);
  }
  const selectedId =
    typeof p.selectedId === 'string' && voyages[p.selectedId]
      ? p.selectedId
      : Object.keys(voyages)[0] ?? '';
  const shipId = typeof p.shipId === 'string' ? p.shipId : '';
  // Per-file consumption defaults: kept only if present; invalid blobs are
  // normalized field-by-field (same never-crash stance as leg clamping).
  const consumptionDefaults =
    p.consumptionDefaults != null ? normalizeSettings(p.consumptionDefaults) : undefined;
  return buildBundle(voyages, selectedId, shipId, consumptionDefaults);
}

// Fill any missing top-level voyage fields so downstream code can trust the shape.
function normalizeVoyage(v: Voyage, id: string): Voyage {
  return {
    id: typeof v.id === 'string' && v.id ? v.id : id,
    // Number defaults to the id (imported cruises key on their voyage number).
    number: typeof v.number === 'string' ? v.number : String((v as { number?: unknown }).number ?? id),
    title: typeof v.title === 'string' ? v.title : `Voyage ${id}`,
    ended: !!v.ended,
    locked: v.locked !== false,
    loggedBy: typeof v.loggedBy === 'string' ? v.loggedBy : '',
    legs: Array.isArray(v.legs) ? v.legs.map(normalizeLeg) : [],
    versions: Array.isArray(v.versions) ? v.versions : [],
    ...(() => {
      const overrides = normalizeOverrides(v.consumptionOverrides);
      return overrides ? { consumptionOverrides: overrides } : null;
    })(),
    ...(() => {
      const snap = normalizeConsumptionSnapshot(v.consumption);
      return snap ? { consumption: snap } : null;
    })(),
  };
}

// True when a phase carries a real CalculationResult (has an engineResults
// array). The report dereferences these, so a snapshot missing one would crash.
const hasResult = (p: unknown): boolean =>
  !!p && typeof p === 'object' &&
  Array.isArray((p as { engineResults?: unknown }).engineResults);

// Every phase the report reads a CalculationResult off must have one. Snapshots
// from builds before the shared-plant-core rewrite lack these fields (St/By in
// particular), so the whole snapshot is dropped → the report shows its empty
// state and the user recalculates. Sea/port are guarded defensively too.
function snapshotPhasesComplete(legs: unknown[]): boolean {
  return legs.every((leg) => {
    if (!leg || typeof leg !== 'object') return true;
    const l = leg as Record<string, unknown>;
    if (l.sea && !hasResult((l.sea as Record<string, unknown>).openResult)) return false;
    if (l.stbyArr && !hasResult((l.stbyArr as Record<string, unknown>).result)) return false;
    if (l.stbyDep && !hasResult((l.stbyDep as Record<string, unknown>).result)) return false;
    if (l.portStay && !hasResult((l.portStay as Record<string, unknown>).result)) return false;
    return true;
  });
}

// A persisted consumption snapshot is display data — trust its numbers but
// verify the envelope so a hand-edited blob can't crash the report. Anything
// structurally off is dropped (the user just recalculates).
function normalizeConsumptionSnapshot(v: unknown): VoyageConsumption | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (
    typeof o.computedAt !== 'string' ||
    typeof o.inputSignature !== 'string' ||
    !Array.isArray(o.legs) ||
    !o.totals || typeof o.totals !== 'object' ||
    !o.settings || typeof o.settings !== 'object'
  ) {
    return undefined;
  }
  if (!snapshotPhasesComplete(o.legs)) return undefined;
  return {
    computedAt: o.computedAt,
    by: typeof o.by === 'string' ? o.by : '',
    settings: normalizeSettings(o.settings),
    inputSignature: o.inputSignature,
    legs: o.legs as VoyageConsumption['legs'],
    totals: o.totals as VoyageConsumption['totals'],
    warnings: Array.isArray(o.warnings) ? o.warnings.filter((w) => typeof w === 'string') : [],
  };
}

const LEG_TYPES = new Set<LegType>(['Port', 'Sea', 'Tender']);
const str = (val: unknown): string => (typeof val === 'string' ? val : '');

// Coerce one (possibly hand-edited) leg into the strict Leg shape. A bad `type`
// or a non-string field would otherwise crash LegRow (e.g. TYPE_CHIP[leg.type]),
// so clamp `type`/`mode` to known values and force every other field to a string.
function normalizeLeg(raw: unknown): Leg {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    type: LEG_TYPES.has(o.type as LegType) ? (o.type as LegType) : 'Port',
    date: str(o.date),
    port: str(o.port),
    dist: str(o.dist),
    mode: o.mode === 'time' ? 'time' : 'speed',
    eta: str(o.eta),
    arr: str(o.arr),
    dep: str(o.dep),
    faw: str(o.faw),
    sunrise: str(o.sunrise),
    sunset: str(o.sunset),
    utc: str(o.utc),
    openLoop: str(o.openLoop),
    seaCond: str(o.seaCond),
    stbyArrDist: str(o.stbyArrDist),
    stbyDepDist: str(o.stbyDepDist),
    stbyArrPowerMW: str(o.stbyArrPowerMW),
    stbyDepPowerMW: str(o.stbyDepPowerMW),
    remarks: str(o.remarks),
    speed: str(o.speed),
  };
}
