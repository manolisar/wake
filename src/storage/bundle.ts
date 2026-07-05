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

export const BUNDLE_VERSION = 1;
export const APP_ID = 'voyage-speed-planner-sl';
// 25 MB guard so a malformed/hostile file can't OOM the tab on JSON.parse.
const MAX_BYTES = 25 * 1024 * 1024;

export function buildBundle(voyages: VoyageMap, selectedId: string, shipId = ''): Bundle {
  return {
    bundleVersion: BUNDLE_VERSION,
    app: APP_ID,
    shipId,
    exportedAt: new Date().toISOString(),
    selectedId,
    voyages,
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

  if (p.bundleVersion !== BUNDLE_VERSION) {
    throw new Error(
      `Unsupported file: expected bundleVersion ${BUNDLE_VERSION} or a single voyage JSON ` +
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
  return buildBundle(voyages, selectedId, shipId);
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
    remarks: str(o.remarks),
    speed: str(o.speed),
  };
}
