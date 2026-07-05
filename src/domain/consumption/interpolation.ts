// Linear interpolation on the FAT trial tables, ported verbatim from
// ~/Projects/voyage-planner/src/engine/interpolation.ts.

import { trialData, sfocPoints } from './trialData';

export function interpPropPower(speed: number): number {
  if (speed <= 0) return 0;
  const last = trialData[trialData.length - 1];
  if (speed >= last.speed) return last.power;

  for (let i = 0; i < trialData.length - 1; i++) {
    if (speed >= trialData[i].speed && speed <= trialData[i + 1].speed) {
      const t = (speed - trialData[i].speed) / (trialData[i + 1].speed - trialData[i].speed);
      return trialData[i].power + t * (trialData[i + 1].power - trialData[i].power);
    }
  }
  return 0;
}

export function interpSFOC(loadFrac: number): number {
  if (loadFrac <= sfocPoints[0].load) return sfocPoints[0].sfoc;
  const last = sfocPoints[sfocPoints.length - 1];
  if (loadFrac >= last.load) return last.sfoc;

  for (let i = 0; i < sfocPoints.length - 1; i++) {
    if (loadFrac >= sfocPoints[i].load && loadFrac <= sfocPoints[i + 1].load) {
      const t = (loadFrac - sfocPoints[i].load) / (sfocPoints[i + 1].load - sfocPoints[i].load);
      return sfocPoints[i].sfoc + t * (sfocPoints[i + 1].sfoc - sfocPoints[i].sfoc);
    }
  }
  return sfocPoints[0].sfoc;
}
