// Generates src/i18n/zh-Hans.json (Simplified) from the hand-written Traditional dictionary.
import { readFileSync, writeFileSync } from 'node:fs';
import * as OpenCC from 'opencc-js';

const toCN = OpenCC.Converter({ from: 'hk', to: 'cn' });
// A few wording differences beyond character conversion
const FIXUPS = [['今日', '今天'], ['搜寻', '搜索'], ['资料', '数据'], ['网页', '网页']];

const convert = (v) => {
  if (typeof v === 'string') {
    let s = toCN(v);
    for (const [a, b] of FIXUPS) s = s.split(a).join(b);
    return s;
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convert(x)]));
  return v;
};

const src = JSON.parse(readFileSync(new URL('../src/i18n/zh-Hant.json', import.meta.url), 'utf8'));
writeFileSync(new URL('../src/i18n/zh-Hans.json', import.meta.url), JSON.stringify(convert(src), null, 2) + '\n');
console.log('zh-Hans.json written');
