const UA = 'LowerMainlandSalmonMap/1.0 (+https://github.com/Lian-D/lower-mainland-salmon-fisheries-map)';

export async function fetchText(url: string, init: RequestInit = {}, attempts = 3, timeoutMs = 90_000): Promise<string> {
  const r = await fetchPage(url, init, null, attempts, timeoutMs);
  return r.text ?? '';
}

export interface Validators { etag?: string | null; lastModified?: string | null }
export interface PageResult { notModified: boolean; text?: string; validators: Validators }

/** GET with retries. Sends If-None-Match / If-Modified-Since when we have them, so an unchanged page costs a 304. */
export async function fetchPage(url: string, init: RequestInit = {}, prev: Validators | null = null, attempts = 3, timeoutMs = 90_000): Promise<PageResult> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': UA,
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...((init.headers as Record<string, string>) || {}),
      };
      if (prev?.etag) headers['If-None-Match'] = prev.etag;
      if (prev?.lastModified) headers['If-Modified-Since'] = prev.lastModified;
      const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
      const validators = { etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') };
      if (res.status === 304) return { notModified: true, validators: prev ?? validators };
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return { notModified: false, text: await res.text(), validators };
    } catch (err) {
      // Node's fetch hides the real reason (DNS, TLS, reset…) in err.cause
      const cause = err instanceof Error && (err as Error & { cause?: { code?: string; message?: string } }).cause;
      lastErr = cause ? new Error(`${(err as Error).message}: ${cause.code ?? ''} ${cause.message ?? ''}`.trim()) : err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * The page's "last changed" date: the newest of its metadata date, the footer "Date modified", and any
 * "Last updated: YYYY-MM-DD" lines inside it (Area 29's tabs carry their own, newer dates).
 */
export function pageModified(html: string): string | null {
  const dates: string[] = [];
  const meta =
    html.match(/<meta[^>]+name=["']dcterms\.modified["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']dcterms\.modified["']/i);
  if (meta) dates.push(meta[1].trim());
  const text = html.replace(/<[^>]+>/g, ' ');
  const footer = text.match(/Date modified:\s*(\d{4}-\d{2}-\d{2})/);
  if (footer) dates.push(footer[1]);
  for (const m of text.matchAll(/Last updated:\s*(\d{4}-\d{2}-\d{2})/g)) dates.push(m[1]);
  return dates.filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort().pop() ?? null;
}

/**
 * Re-process only when DFO's "Date modified" changes. We also re-process when we've never parsed the page
 * (only built-in data), when the date can't be read, or when forced.
 */
export function needsReparse(prev: { sourceModified: string | null; seed?: boolean } | null, modified: string | null, force: boolean): boolean {
  if (force || !prev || prev.seed) return true;
  if (!modified) return true;
  return modified !== prev.sourceModified;
}
