// Sample voyage dataset — TEST/DEV FIXTURE ONLY. Ported from the original
// design artifact's initial state: authentic voyage 586 (Caribbean Crossing,
// Celebrity Eclipse, Dec 2026), a partial 587 that exercises TIME mode, and
// generated 588–621. The app does NOT import this — it is referenced only by
// the unit tests, so it never reaches the production bundle.
import type { Leg, VoyageMap } from '../types';

const LB = 'M. Archontakis · Chief';

/** Fill a partial leg literal up to a complete Leg (every field present). */
function leg(p: Partial<Leg>): Leg {
  return {
    type: p.type ?? 'Port',
    date: p.date ?? '',
    port: p.port ?? '',
    dist: p.dist ?? '',
    mode: p.mode ?? 'speed',
    eta: p.eta ?? '',
    arr: p.arr ?? '',
    dep: p.dep ?? '',
    faw: p.faw ?? '',
    sunrise: p.sunrise ?? '',
    sunset: p.sunset ?? '',
    utc: p.utc ?? '',
    openLoop: p.openLoop ?? '',
    seaCond: p.seaCond ?? '',
    stbyArrDist: p.stbyArrDist ?? '',
    stbyDepDist: p.stbyDepDist ?? '',
    stbyArrPowerMW: p.stbyArrPowerMW ?? '',
    stbyDepPowerMW: p.stbyDepPowerMW ?? '',
    remarks: p.remarks ?? '',
    speed: p.speed ?? '',
  };
}

const v586: Leg[] = [
  leg({ type: 'Port', date: '2026-12-22', port: 'Fort Lauderdale, Florida', dist: '', dep: '16:00', faw: '17:00', sunrise: '07:04', sunset: '17:33', utc: '-5', remarks: 'Embark' }),
  leg({ type: 'Sea', date: '2026-12-23', port: 'At Sea', dist: '35', utc: '-5', remarks: '1 hour forward @02:00' }),
  leg({ type: 'Sea', date: '2026-12-24', port: 'At Sea', dist: '29', utc: '-4' }),
  leg({ type: 'Port', date: '2026-12-25', port: 'Basseterre, St. Kitts & Nevis', dist: '1130', eta: '08:00', arr: '09:00', dep: '18:00', faw: '19:00', sunrise: '06:33', sunset: '17:38', utc: '-4', seaCond: '60:00', openLoop: '58:00', stbyArrDist: '11', stbyDepDist: '9' }),
  leg({ type: 'Port', date: '2026-12-26', port: 'Castries, St. Lucia', dist: '221', eta: '07:00', arr: '08:00', dep: '18:00', faw: '19:00', sunrise: '06:19', sunset: '17:38', utc: '-4', seaCond: '06:00', openLoop: '04:00', stbyArrDist: '8', stbyDepDist: '7' }),
  leg({ type: 'Port', date: '2026-12-27', port: 'Bridgetown, Barbados', dist: '110', eta: '07:00', arr: '08:00', dep: '18:00', faw: '19:00', sunrise: '06:18', sunset: '17:40', utc: '-4', seaCond: '08:00', openLoop: '06:30' }),
  leg({ type: 'Sea', date: '2026-12-28', port: 'At Sea', dist: '29', utc: '-4' }),
  leg({ type: 'Port', date: '2026-12-29', port: 'Willemstad, Curacao', dist: '560', eta: '07:00', arr: '08:00', dep: '20:00', faw: '21:00', sunrise: '06:55', sunset: '18:20', utc: '-4', seaCond: '30:00', openLoop: '26:00' }),
  leg({ type: 'Port', date: '2026-12-30', port: 'Kralendijk, Bonaire', dist: '98', eta: '07:00', arr: '08:00', dep: '20:00', faw: '21:00', sunrise: '06:52', sunset: '18:18', utc: '-4', seaCond: '09:00', openLoop: '07:00' }),
  leg({ type: 'Port', date: '2026-12-31', port: 'Oranjestad, Aruba', dist: '110', eta: '05:30', arr: '07:00', dep: '17:00', faw: '18:00', sunrise: '07:01', sunset: '18:25', utc: '-4', seaCond: '06:00', openLoop: '04:30' }),
  leg({ type: 'Sea', date: '2027-01-01', port: 'At Sea', dist: '29', utc: '-4', remarks: '1 hour back @02:00' }),
  leg({ type: 'Sea', date: '2027-01-02', port: 'At Sea', dist: '35', utc: '-5' }),
  leg({ type: 'Port', date: '2027-01-03', port: 'Fort Lauderdale, Florida', dist: '1095', eta: '04:15', arr: '07:00', sunrise: '07:08', sunset: '17:36', utc: '-5', seaCond: '50:00', openLoop: '42:00', remarks: 'Disembark' }),
];

const v587: Leg[] = [
  leg({ type: 'Port', date: '2027-01-03', port: 'Fort Lauderdale, Florida', dist: '', dep: '16:30', faw: '17:30', sunrise: '07:08', sunset: '17:36', utc: '-5', remarks: 'Embark' }),
  leg({ type: 'Sea', date: '2027-01-04', port: 'At Sea', dist: '30', utc: '-5' }),
  leg({ type: 'Port', date: '2027-01-05', port: 'Perfect Day, CocoCay', dist: '420', mode: 'time', dep: '17:00', faw: '18:00', sunrise: '06:48', sunset: '17:42', utc: '-5', seaCond: '20:00', openLoop: '18:00', remarks: 'Tendering — target SOA', speed: '18' }),
  leg({ type: 'Port', date: '2027-01-06', port: 'Nassau, Bahamas', dist: '140', eta: '08:00', arr: '09:00', dep: '18:00', faw: '19:00', sunrise: '06:47', sunset: '17:43', utc: '-5', seaCond: '10:00', openLoop: '08:00' }),
  leg({ type: 'Port', date: '2027-01-07', port: 'Fort Lauderdale, Florida', dist: '185', eta: '06:30', arr: '07:30', sunrise: '07:09', sunset: '17:38', utc: '-5', seaCond: '08:00', openLoop: '06:00', remarks: 'Disembark' }),
];

const ROUTE_NAMES = [
  'Caribbean Crossing',
  'Southern Caribbean',
  'Bahamas Short',
  'Eastern Caribbean',
  'Western Caribbean',
  'ABC Islands',
  'Panama Canal',
  'Repositioning',
];

export function seedVoyages(): VoyageMap {
  const voyages: VoyageMap = {
    '586': {
      id: '586',
      number: '586',
      title: 'Voyage 586 — Caribbean Crossing',
      ended: true,
      locked: true,
      loggedBy: LB,
      legs: v586,
      versions: [
        { action: 'Created', by: LB, note: 'Template seeded from fleet schedule', at: '2026-11-02 09:14' },
        { action: 'Locked', by: LB, note: 'Approved — voyage commenced', at: '2026-12-22 16:40' },
      ],
    },
    '587': {
      id: '587',
      number: '587',
      title: 'Voyage 587 — Bahamas Short',
      ended: false,
      locked: false,
      loggedBy: LB,
      legs: v587,
      versions: [{ action: 'Created', by: LB, note: 'Drafting — short Bahamas turn', at: '2026-12-20 11:02' }],
    },
  };
  for (let id = 588; id <= 621; id++) {
    const title = 'Voyage ' + id + ' — ' + ROUTE_NAMES[(id - 588) % ROUTE_NAMES.length];
    voyages[String(id)] = {
      id: String(id),
      number: String(id),
      title,
      ended: id < 600,
      locked: true,
      loggedBy: LB,
      legs: [] as Leg[],
      versions: [{ action: 'Created', by: LB, note: 'Template seeded', at: '2026-11-02 09:14' }],
    };
  }
  return voyages;
}

export const SEED_SELECTED_ID = '586';
