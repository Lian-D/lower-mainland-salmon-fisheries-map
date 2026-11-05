import { cookies, headers } from 'next/headers';
import App from '@/components/App';
import { getAppData } from '@/lib/appdata';
import type { Lang } from '@/i18n';

export const dynamic = 'force-dynamic';

function pickLang(cookie: string | undefined, accept: string | null): Lang {
  if (cookie === 'en' || cookie === 'zh-Hant' || cookie === 'zh-Hans') return cookie;
  const a = (accept ?? '').toLowerCase();
  if (/zh-(tw|hk|mo|hant)/.test(a)) return 'zh-Hant';
  if (/^zh|,\s*zh/.test(a)) return 'zh-Hans';
  return 'en';
}

export default async function Page() {
  const [data, c, h] = await Promise.all([getAppData(), cookies(), headers()]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(new Date());
  const lang = pickLang(c.get('lang')?.value, h.get('accept-language'));
  return <App initial={data} today={today} initialLang={lang} />;
}
