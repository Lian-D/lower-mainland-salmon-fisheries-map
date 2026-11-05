import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Area29Data, Region2Data } from './types';
import seedRegion2 from './seed/region2.json';
import seedArea29 from './seed/area29.json';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

const file = (name: string) => path.join(DATA_DIR, name);

export async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file(name), 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Atomic write: write to a temp file and rename over the old one. */
export async function writeJson(name: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = file(`${name}.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file(name));
}

export async function getRegion2(): Promise<Region2Data> {
  return (await readJson<Region2Data>('region2.json')) ?? ({ ...(seedRegion2 as Region2Data), seed: true });
}

export async function getArea29(): Promise<Area29Data> {
  return (await readJson<Area29Data>('area29.json')) ?? ({ ...(seedArea29 as Area29Data), seed: true });
}

export interface FetchLog {
  regulations?: { at: string; ok: boolean; error?: string };
  rivers?: { at: string; ok: boolean; error?: string };
  subareas?: { at: string; ok: boolean; error?: string };
  riverAreas?: { at: string; ok: boolean; error?: string };
}

export async function getLog(): Promise<FetchLog> {
  return (await readJson<FetchLog>('fetch-log.json')) ?? {};
}

export async function logAttempt(kind: keyof FetchLog, ok: boolean, error?: string) {
  const log = await getLog();
  log[kind] = { at: new Date().toISOString(), ok, ...(error ? { error } : {}) };
  await writeJson('fetch-log.json', log);
}
