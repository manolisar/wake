// The Solstice-class fleet (identical plant; same roster as Voyage Tracker v8).
import type { Ship, ShipCode } from '../types';

export const SHIPS: Ship[] = [
  { code: 'SL', name: 'Celebrity Solstice', built: 2008 },
  { code: 'EQ', name: 'Celebrity Equinox', built: 2009 },
  { code: 'EC', name: 'Celebrity Eclipse', built: 2010 },
  { code: 'SI', name: 'Celebrity Silhouette', built: 2011 },
  { code: 'RF', name: 'Celebrity Reflection', built: 2012 },
];

const BY_CODE: Record<ShipCode, Ship> = Object.fromEntries(SHIPS.map((s) => [s.code, s])) as Record<ShipCode, Ship>;

export function shipByCode(code: ShipCode): Ship {
  return BY_CODE[code];
}

export function isShipCode(v: unknown): v is ShipCode {
  return typeof v === 'string' && v in BY_CODE;
}
