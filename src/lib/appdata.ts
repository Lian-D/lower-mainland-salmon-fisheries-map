import { getArea29, getLog, getRegion2 } from './store';
import type { AppData } from './types';
import { buildWaters } from './viewmodel';

export async function getAppData(): Promise<AppData> {
  const [region2, area29, log] = await Promise.all([getRegion2(), getArea29(), getLog()]);
  return { region2, area29, waters: buildWaters(region2), lastAttempt: log.regulations ?? null };
}
