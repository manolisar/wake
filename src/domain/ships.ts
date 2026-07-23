// The Solstice-class fleet (identical plant; same roster as Voyage Tracker v8).
import type { Ship, ShipCode } from '../types';

export const SHIPS: Ship[] = [
  { code: 'SL', name: 'Celebrity Solstice', built: 2008, plant: 'wartsila-46' },
  { code: 'EQ', name: 'Celebrity Equinox', built: 2009, plant: 'wartsila-46' },
  { code: 'EC', name: 'Celebrity Eclipse', built: 2010, plant: 'wartsila-46' },
  { code: 'SI', name: 'Celebrity Silhouette', built: 2011, plant: 'man' },
  { code: 'RF', name: 'Celebrity Reflection', built: 2012, plant: 'man' },
];

/**
 * Whether the consumption engine (Wärtsilä 16V46, FAT PAAE072242) is validated
 * for this ship. True only for the three identical sisters SL/EQ/EC. SI/RF run
 * MAN plants — the model's numbers do not transfer. Unknown codes default to
 * validated (the app ships EC-first and hand-edited files shouldn't be blocked).
 */
export function isModeledPlant(code: string): boolean {
  return !(isShipCode(code) && BY_CODE[code].plant === 'man');
}

const BY_CODE: Record<ShipCode, Ship> = Object.fromEntries(SHIPS.map((s) => [s.code, s])) as Record<ShipCode, Ship>;

export function shipByCode(code: ShipCode): Ship {
  return BY_CODE[code];
}

export function isShipCode(v: unknown): v is ShipCode {
  return typeof v === 'string' && v in BY_CODE;
}
