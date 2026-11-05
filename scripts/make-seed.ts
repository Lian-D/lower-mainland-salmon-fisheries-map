// Regenerates the built-in data from copies of the live DFO pages in test/real/.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseRegion2 } from '../src/lib/scrape/region2.ts';
import { parseArea29 } from '../src/lib/scrape/area29.ts';
const r2 = parseRegion2(readFileSync('test/real/region2-live.html', 'utf8'));
r2.fetchedAt = '2026-10-21T19:00:00.000Z';
writeFileSync('src/lib/seed/region2.json', JSON.stringify(r2, null, 1));
const a29 = parseArea29(readFileSync('test/real/area29-salmon-tab.html', 'utf8'));
a29.fetchedAt = '2026-10-21T19:00:00.000Z';
a29.sourceModified = '2026-10-20';
a29.anchor = null;
writeFileSync('src/lib/seed/area29.json', JSON.stringify(a29, null, 1));
console.log('seed written:', r2.entries.length, 'Region 2 entries;', a29.regs?.length, 'Area 29 regs,', a29.restrictions?.length, 'restrictions; tidal Fraser', a29.status);
