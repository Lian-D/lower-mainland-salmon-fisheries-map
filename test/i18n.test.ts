import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../src/lib/seed/region2.json' with { type: 'json' };
import { areaText, limitText, sentence, waterName } from '../src/i18n/index.ts';

for (const lang of ['zh-Hant', 'zh-Hans'] as const) {
  test(`every current DFO string has a ${lang} translation`, () => {
    for (const e of seed.entries) {
      assert.ok(waterName(lang, e.water).secondary, `water: ${e.water}`);
      if (e.area) assert.ok(areaText(lang, e.area).translated, `area: ${e.area}`);
      for (const r of e.rules) assert.ok(limitText(lang, r.text).translated, `limit: ${r.text}`);
    }
    for (const s of [...seed.general, ...seed.preamble]) assert.ok(sentence(lang, s).translated, `sentence: ${s}`);
  });
}

test('limit patterns', () => {
  assert.equal(limitText('zh-Hant', '4 hatchery marked per day, only 2 over 35 cm').text, '每日 4 條（只限孵化場標記魚），其中最多 2 條超過 35 厘米');
  assert.equal(limitText('zh-Hans', '1 per day, hatchery marked only').text, '每日 1 条（只限孵化场标记鱼）');
});
