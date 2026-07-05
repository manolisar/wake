// First-run dataset for a ship. The app ships NO demo data — every ship starts
// empty. Crews load voyages from a `.json` file (Open), an Excel import, or
// create them (New Voyage), choosing where to load/save when the picker prompts.
//
// (The worked sample voyages used by the unit tests live in `sampleVoyages.ts`,
// which the app never imports — so they never reach the production bundle.)
import type { VoyageMap } from '../types';

export function seedForShip(): { voyages: VoyageMap; selectedId: string } {
  return { voyages: {}, selectedId: '' };
}
