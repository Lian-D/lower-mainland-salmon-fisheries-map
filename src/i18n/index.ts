import en from './en.json';
import hant from './zh-Hant.json';
import hans from './zh-Hans.json';

export type Lang = 'en' | 'zh-Hant' | 'zh-Hans';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'zh-Hant', label: '繁' },
  { id: 'zh-Hans', label: '简' },
];

type Dict = Record<string, unknown> & { waters?: Record<string, string>; areas?: Record<string, string>; sentences?: Record<string, string> };
const DICTS: Record<Lang, Dict> = { en: en as Dict, 'zh-Hant': hant as Dict, 'zh-Hans': hans as Dict };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Lookup tables keyed by normalised English so small punctuation changes on the DFO page still match. */
const lookups = new Map<string, Map<string, string>>();
function lookup(lang: Lang, table: 'waters' | 'areas' | 'sentences', english: string): string | null {
  const id = `${lang}:${table}`;
  let m = lookups.get(id);
  if (!m) {
    m = new Map(Object.entries(DICTS[lang][table] ?? {}).map(([k, v]) => [norm(k), v]));
    lookups.set(id, m);
  }
  return m.get(norm(english)) ?? null;
}

export type T = (key: string, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): T {
  const d = DICTS[lang];
  return (key, vars) => {
    let s = (d[key] as string | undefined) ?? (DICTS.en[key] as string | undefined) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

export const isZh = (lang: Lang) => lang !== 'en';

export function waterName(lang: Lang, english: string): { primary: string; secondary: string | null } {
  if (!isZh(lang)) return { primary: english, secondary: null };
  const zh = lookup(lang, 'waters', english);
  return zh ? { primary: zh, secondary: english } : { primary: english, secondary: null };
}

export function areaText(lang: Lang, english: string): { text: string; translated: boolean } {
  if (!isZh(lang) || !english) return { text: english, translated: true };
  const zh = lookup(lang, 'areas', english);
  return zh ? { text: zh, translated: true } : { text: english, translated: false };
}

export function sentence(lang: Lang, english: string): { text: string; translated: boolean } {
  if (!isZh(lang)) return { text: english, translated: true };
  const zh = lookup(lang, 'sentences', english);
  return zh ? { text: zh, translated: true } : { text: english, translated: false };
}

/** Translate a DFO limit/gear cell by pattern ("4 hatchery marked per day, only 2 over 35 cm"). */
export function limitText(lang: Lang, english: string): { text: string; translated: boolean } {
  if (!isZh(lang)) return { text: english, translated: true };
  const t = makeT(lang);
  const s = english.trim().replace(/\s+/g, ' ').replace(/\.$/, '');
  const fixed: [RegExp, string][] = [
    [/^non-?retention$/i, 'limit.nonRetention'],
    [/^bait ban$/i, 'limit.baitBan'],
    [/^single barbless hook$/i, 'limit.barbless'],
    [/^no fishing for salmon$/i, 'limit.noFishing'],
  ];
  for (const [re, key] of fixed) if (re.test(s)) return { text: t(key), translated: true };

  const m = s.match(/^(\d+) (hatchery[- ]marked )?per day(?:, hatchery[- ]marked only)?(?:, only (\d+) over (\d+) ?cm)?$/i);
  if (m) {
    const hatchery = !!m[2] || /hatchery[- ]marked only/i.test(s);
    let out = t('limit.perDay', { n: m[1] });
    if (hatchery) out += `（${t('limit.hatchery')}）`;
    if (m[3]) out += `，${t('limit.over', { m: m[3], cm: m[4] })}`;
    return { text: out, translated: true };
  }
  return { text: english, translated: false };
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatMD(lang: Lang, mmdd: string): string {
  const [m, d] = mmdd.split('-').map(Number);
  return isZh(lang) ? `${m}月${d}日` : `${MONTHS_EN[m - 1]} ${d}`;
}

export function formatRange(lang: Lang, from: string, to: string | null): string {
  const t = makeT(lang);
  if (from === '04-01' && to === '03-31') return t('allYear');
  if (to === null) return `${formatMD(lang, from)} – ${t('untilNotice')}`;
  return `${formatMD(lang, from)} – ${formatMD(lang, to)}`;
}

export function formatDateTime(lang: Lang, iso: string): string {
  const loc = lang === 'en' ? 'en-CA' : lang === 'zh-Hant' ? 'zh-HK' : 'zh-CN';
  return new Date(iso).toLocaleString(loc, { timeZone: 'America/Vancouver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatISODate(lang: Lang, isoDate: string): string {
  const local = isoDate.length > 10 ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(new Date(isoDate)) : isoDate;
  const [y, m, d] = local.slice(0, 10).split('-').map(Number);
  return isZh(lang) ? `${y}年${m}月${d}日` : `${MONTHS_EN[m - 1]} ${d}, ${y}`;
}
