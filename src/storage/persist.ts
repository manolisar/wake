// Lossless autosave to localStorage, keyed PER SHIP (each ship is an
// independent workspace). A refresh is non-destructive even without a manual
// JSON Save; the .json file (storage/jsonFile.ts) is the portable record.
import type { ShipCode, VoyageMap } from '../types';

// v7: bumped when the bundled demo seed was removed so previously-seeded
// caches don't resurrect the sample voyages. Each ship now starts empty.
const PREFIX = 'vt_speed_voyages_v7';

function keyFor(ship: ShipCode): string {
  return `${PREFIX}_${ship}`;
}

interface PersistShape {
  voyages: VoyageMap;
  selectedId: string;
}

export function loadPersisted(ship: ShipCode): PersistShape | null {
  try {
    const raw = localStorage.getItem(keyFor(ship));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved && saved.voyages) {
      return { voyages: saved.voyages, selectedId: saved.selectedId ?? '' };
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

export function persist(ship: ShipCode, voyages: VoyageMap, selectedId: string): void {
  try {
    localStorage.setItem(keyFor(ship), JSON.stringify({ voyages, selectedId }));
  } catch {
    /* quota / private mode — non-fatal */
  }
}
