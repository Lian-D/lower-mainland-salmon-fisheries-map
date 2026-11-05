'use client';

import { useMemo } from 'react';
import { areaText, formatDateTime, formatISODate, formatMD, formatRange, isZh, limitText, sentence, waterName } from '@/i18n';
import { FRASER_REF, fraserScope, nextOpening, restrictionsFor, ruleApplies, rowsFor, speciesTable, statusOf, subScope, tidalStatus, TIDAL_FRASER_SUBS, type Status } from '@/lib/rules';
import { sunTimes } from '@/lib/sun';
import type { AppData, Area29Data, Area29Restriction, Species, WaterVM } from '@/lib/types';
import { IconBack, IconExternal, IconSun, IconTarget } from './icons';
import { STATUS_COLOR, TIDAL_COLOR, TIDAL_ID } from './MapView';
import { useI18n } from './i18n-context';

const ORDER: Status[] = ['open', 'nr', 'off', 'banned'];

export function StatusDot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden />;
}

function Untranslated() {
  const { t } = useI18n();
  return <span className="badge muted">{t('untranslated')}</span>;
}

/* ------------------------------------------------------------------ */

export function Legend() {
  const { t } = useI18n();
  return (
    <div className="legend">
      {(['open', 'nr', 'off'] as Status[]).map((s) => (
        <span key={s}><i style={{ background: STATUS_COLOR[s] }} />{t(`legend.${s}`)}</span>
      ))}
      <span><i className="dash" style={{ color: STATUS_COLOR.banned }} />{t('legend.banned')}</span>
      <span><i className="sub" />{t('legend.subareas')}</span>
    </div>
  );
}

export function Freshness({ data }: { data: AppData }) {
  const { t, lang } = useI18n();
  const r = data.region2;
  const failed = data.lastAttempt && !data.lastAttempt.ok;
  return (
    <div className="fresh">
      {r.seed ? (
        <p className="warn">{t('fresh.seed')}</p>
      ) : (
        <p>
          <span className="live" aria-hidden /> {t('fresh.checked', { time: formatDateTime(lang, r.checkedAt ?? r.fetchedAt) })}
          {r.sourceModified && <> · {t('fresh.modified', { date: formatISODate(lang, r.sourceModified) })}</>}
        </p>
      )}
      {failed && <p className="warn">{t('fresh.failed', { time: formatDateTime(lang, data.lastAttempt!.at) })}</p>}
      {r.changes && Date.now() - Date.parse(r.changes.at) < 14 * 864e5 && (
        <p className="changed-line">
          {t('fresh.changes', { date: formatISODate(lang, r.changes.at), waters: r.changes.waters.map((w) => waterName(lang, w).primary).join(isZh(lang) ? '、' : ', ') })}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function summary(w: WaterVM, mmdd: string, filter: Species, lang: ReturnType<typeof useI18n>['lang'], t: ReturnType<typeof useI18n>['t']): string {
  const st = statusOf(w.entries, mmdd, filter);
  if (st === 'off') {
    const next = nextOpening(w.entries, mmdd, filter);
    return next ? t('opens', { date: formatMD(lang, next) }) : '';
  }
  const rules = w.entries.flatMap((e) => e.rules).filter((r) => ruleApplies(r, mmdd, filter) && r.kind !== 'gear');
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const r of rules) {
    const s = `${r.species === 'All' ? '' : t(`species.${r.species}`) + (isZh(lang) ? '：' : ': ')}${limitText(lang, r.text).text}`;
    if (!seen.has(s)) { seen.add(s); parts.push(s); }
  }
  return parts.join(' · ');
}

export function WatersList({ data, mmdd, filter, query, onSelect }: { data: AppData; mmdd: string; filter: Species; query: string; onSelect: (id: string) => void }) {
  const { t, lang } = useI18n();
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const g: Record<Status, WaterVM[]> = { open: [], nr: [], off: [], banned: [] };
    for (const w of data.waters) {
      const n = waterName(lang, w.name);
      if (q && !`${n.primary} ${n.secondary ?? ''} ${w.name}`.toLowerCase().includes(q)) continue;
      g[statusOf(w.entries, mmdd, filter)].push(w);
    }
    return g;
  }, [data.waters, mmdd, filter, q, lang]);
  const tidalTitle = t('tidal.title');
  const tidalSt = tidalStatus(data.area29, fraserScope(), mmdd, filter);
  const showTidal = !q || `${tidalTitle} fraser tidal area 29 菲沙`.toLowerCase().includes(q);
  const total = ORDER.reduce((n, s) => n + groups[s].length, 0) + (showTidal ? 1 : 0);

  return (
    <div className="list">
      {total === 0 && <p className="empty">{t('noResults')}</p>}
      {ORDER.map((s) =>
        groups[s].length ? (
          <section key={s}>
            <h3 className="group-h"><StatusDot color={STATUS_COLOR[s]} />{t(`group.${s}`)} <span className="count">{groups[s].length}</span></h3>
            <ul>
              {groups[s].map((w) => {
                const n = waterName(lang, w.name);
                const sub = summary(w, mmdd, filter, lang, t);
                return (
                  <li key={w.id}>
                    <button className="item" onClick={() => onSelect(w.id)}>
                      <span className="item-bar" style={{ background: STATUS_COLOR[s] }} aria-hidden />
                      <span className="item-main">
                        <span className="item-name">
                          {n.primary}
                          {w.changed && <span className="badge new">{t('changed')}</span>}
                          {!w.mapped && <span className="badge muted">{t('notOnMap')}</span>}
                        </span>
                        {n.secondary && <span className="item-en">{n.secondary}</span>}
                        {sub && <span className="item-sub">{sub}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}
      {showTidal && (
        <section>
          <h3 className="group-h"><StatusDot color={TIDAL_COLOR[tidalSt]} />{t('group.tidal')}</h3>
          <ul>
            <li>
              <button className="item" onClick={() => onSelect(TIDAL_ID)}>
                <span className="item-bar" style={{ background: TIDAL_COLOR[tidalSt] }} aria-hidden />
                <span className="item-main">
                  <span className="item-name">{tidalTitle}</span>
                  {isZh(lang) && <span className="item-en">Fraser River – tidal (Area 29)</span>}
                  <span className="item-sub">{t(`tidal.s.${tidalSt}`)}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function WaterDetail({ water, mmdd, isoDate, filter, onBack, onZoom }: { water: WaterVM; mmdd: string; isoDate: string; filter: Species; onBack: () => void; onZoom: () => void }) {
  const { t, lang } = useI18n();
  const n = waterName(lang, water.name);
  const st = statusOf(water.entries, mmdd, filter);
  const next = st === 'off' ? nextOpening(water.entries, mmdd, filter) : null;

  return (
    <div className="detail">
      <div className="detail-nav">
        <button className="ghost" onClick={onBack}><IconBack /> {t('back')}</button>
        <button className="ghost" onClick={onZoom}><IconTarget /> {t('zoomTo')}</button>
      </div>
      <h2 className="detail-title">{n.primary}</h2>
      {n.secondary && <p className="detail-en">{n.secondary}</p>}
      <p className="pill" style={{ '--c': STATUS_COLOR[st] } as React.CSSProperties}>
        <StatusDot color={STATUS_COLOR[st]} /> {t('statusOn', { status: t(`status.${st}`), date: formatISODate(lang, isoDate) })}
        {next && <span className="pill-extra"> · {t('opens', { date: formatMD(lang, next) })}</span>}
      </p>
      {!water.mapped && <p className="note">{t('notOnMap')}</p>}

      {water.entries.map((e, i) => {
        const area = areaText(lang, e.area);
        const est = statusOf([e], mmdd, filter);
        return (
          <section key={i} className="entry">
            <h3 className="entry-h">
              <StatusDot color={STATUS_COLOR[est]} />
              <span>{e.area ? area.text : t('area.whole')} {!area.translated && <Untranslated />}</span>
            </h3>
            {isZh(lang) && e.area && area.translated && (
              <details className="orig">
                <summary>{t('officialText')}</summary>
                <p>{e.area}</p>
              </details>
            )}
            <table className="rules">
              <thead>
                <tr><th>{t('rule.species')}</th><th>{t('rule.limit')}</th><th>{t('rule.dates')}</th></tr>
              </thead>
              <tbody>
                {e.rules.map((r, k) => {
                  const lim = limitText(lang, r.text);
                  const on = ruleApplies(r, mmdd, filter);
                  return (
                    <tr key={k} className={on ? `on k-${r.kind}` : ''}>
                      <td>{t(`species.${r.species}`)}</td>
                      <td>
                        {lim.text} {!lim.translated && <Untranslated />}
                        {r.notice && (
                          <a className="notice" href={r.notice.url} target="_blank" rel="noopener noreferrer">
                            {t('notice', { id: r.notice.id })} <IconExternal />
                          </a>
                        )}
                      </td>
                      <td className="dates">{formatRange(lang, r.from, r.to)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="hint">{t('rule.activeHint')}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const salmonTabUrl = (a: Area29Data) => (a.anchor ? `${a.source}#${a.anchor}` : a.source);

const SUBS = Array.from({ length: 17 }, (_, i) => i + 1);

export function TidalDetail({ area29, sub, mmdd, isoDate, filter, onBack, onZoom, onPickSub }: {
  area29: Area29Data; sub: number | null; mmdd: string; isoDate: string; filter: Species;
  onBack: () => void; onZoom: () => void; onPickSub: (n: number | null) => void;
}) {
  const { t, lang } = useI18n();
  const scope = sub === null ? fraserScope() : subScope(sub);
  const st = tidalStatus(area29, scope, mmdd, filter);
  const c = TIDAL_COLOR[st];
  const structured = !!area29.regs?.length;
  const table = structured ? speciesTable(area29, scope, mmdd, filter) : [];
  const rest = structured ? restrictionsFor(area29, scope, mmdd, filter) : [];
  const key = rest.filter(({ r }) => r.closes || r.dailyLimit !== undefined || r.minSize !== undefined || /gear/i.test(r.type));
  const other = rest.filter((x) => !key.includes(x));
  const rows = structured ? [] : rowsFor(area29.rows, scope.subs, filter);
  const kindColor = (k: string) => (k === 'closed' ? TIDAL_COLOR.closed : k === 'open' ? TIDAL_COLOR.open : k === 'nr' ? TIDAL_COLOR.nr : TIDAL_COLOR.unknown);
  const fraserNote = sub !== null && (FRASER_REF.subs.includes(sub) ? t('sub.fraser') : FRASER_REF.partial.includes(sub) ? t('sub.partFraser') : null);
  const restItem = ({ r, part }: { r: Area29Restriction; part: boolean }, i: number) => (
    <li key={i}>
      <StatusDot color={r.closes ? TIDAL_COLOR.closed : r.dailyLimit === 0 ? TIDAL_COLOR.closed : TIDAL_COLOR.unknown} />
      <span>
        <b>{r.species === 'All' ? t('species.All') : t(`species.${r.species}`)}</b> · {rtype(t, r.type)}
        {part && <span className="badge muted part">{t("rest.part", { area: r.areaText })}</span>}
        <br />
        <span className="row-text">{r.details} {isZh(lang) && <Untranslated />}</span>
      </span>
    </li>
  );

  return (
    <div className="detail">
      <div className="detail-nav">
        <button className="ghost" onClick={sub === null ? onBack : () => onPickSub(null)}><IconBack /> {sub === null ? t('back') : t('tidal.title')}</button>
        <button className="ghost" onClick={onZoom}><IconTarget /> {t('zoomTo')}</button>
      </div>
      <h2 className="detail-title">{sub === null ? t('tidal.title') : t('sub.title', { n: sub })}</h2>
      {isZh(lang) && <p className="detail-en">{sub === null ? 'Fraser River – tidal (Area 29)' : `Area 29 – Subarea 29-${sub}`}</p>}
      <p className="pill" style={{ '--c': c } as React.CSSProperties}>
        <StatusDot color={c} /> {t('statusOn', { status: t(`tidal.s.${st}`), date: formatISODate(lang, isoDate) })}
      </p>
      {sub === null ? <p>{t('tidal.where')}</p> : fraserNote && <p className="note">{fraserNote}</p>}

      {structured && (
        <table className="rules tidal">
          <thead><tr><th>{t('rule.species')}</th><th>{t('tbl.status')}</th><th>{t('tbl.limit')}</th><th>{t('tbl.min')}</th></tr></thead>
          <tbody>
            {table.map((x) => (
              <tr key={x.species} className={x.status === 'open' ? 'on k-keep' : x.status === 'nr' ? 'on k-nr' : ''}>
                <td>{t(`species.${x.species}`)}</td>
                <td><StatusDot color={kindColor(x.status)} /> {t(`tidal.k.${x.status}`)}</td>
                <td>{tidalLimit(lang, t, x.limit)}</td>
                <td className="dates">{x.minSize ? x.minSize.replace(/cm$/, isZh(lang) ? ' 厘米' : ' cm') : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {key.length > 0 && (
        <>
          <h3 className="mini-h">{t('rest.key')}</h3>
          <ul className="rows29">{key.map(restItem)}</ul>
        </>
      )}
      {other.length > 0 && (
        <details className="orig">
          <summary>{t('rest.all', { n: other.length })}</summary>
          <ul className="rows29">{other.map(restItem)}</ul>
        </details>
      )}

      {!structured && (
        <>
          <h3 className="mini-h">{t('sub.rules', { n: rows.length })}</h3>
          {rows.length ? (
            <ul className="rows29">
              {rows.map((r, i) => (
                <li key={i}><StatusDot color={kindColor(r.kind)} /><span><b>{r.species && r.species !== 'All' ? t(`species.${r.species}`) : t('species.All')}</b><br /><span className="row-text">{r.text}</span></span></li>
              ))}
            </ul>
          ) : <p className="note">{t('sub.none')}</p>}
        </>
      )}

      <h3 className="mini-h">{t('sub.grid')}</h3>
      <div className="subgrid">
        {SUBS.map((n) => {
          const sc = TIDAL_COLOR[tidalStatus(area29, subScope(n), mmdd, filter)];
          return (
            <button key={n} className={`subchip${sub === n ? ' on' : ''}${TIDAL_FRASER_SUBS.includes(n) ? ' fraser' : ''}`} style={{ '--c': sc } as React.CSSProperties} onClick={() => onPickSub(n)}>
              29-{n}
            </button>
          );
        })}
      </div>
      <p className="hint">{t('sub.gridHint')}</p>

      {area29.changedAt && Date.now() - Date.parse(area29.changedAt) < 30 * 864e5 && <p className="warn">{t('tidal.changed', { date: formatISODate(lang, area29.changedAt) })}</p>}
      {area29.scope === 'page' && <p className="warn">{t('tidal.noTab')}</p>}
      <p className="hint">
        {area29.salmonUpdated && <>{t('tidal.updated', { date: formatISODate(lang, area29.salmonUpdated) })} · </>}
        {t('tidal.checkedOnly', { time: area29.seed ? formatISODate(lang, area29.fetchedAt) : formatDateTime(lang, area29.checkedAt ?? area29.fetchedAt) })}
      </p>
      <a className="source-link" href={salmonTabUrl(area29)} target="_blank" rel="noopener noreferrer">{t('tidal.salmonTab')} <IconExternal /></a>
    </div>
  );
}

const RTYPES: Record<string, string> = { closed: 'rtype.closed', reminder: 'rtype.reminder', 'gear restriction': 'rtype.gear', 'daily limit pieces': 'rtype.daily', 'minimum size (cm)': 'rtype.min', 'annual limit pieces': 'rtype.annual' };
function rtype(t: ReturnType<typeof useI18n>['t'], type: string) {
  const k = RTYPES[type.trim().toLowerCase()];
  return k ? t(k) : type;
}

/** "2 Combined Total * Consisting of no more than: 2 - Hatchery - marked0 - Wild - unmarked" → readable */
function tidalLimit(lang: ReturnType<typeof useI18n>['lang'], t: ReturnType<typeof useI18n>['t'], limit: string): string {
  const s = limit.trim();
  if (!s) return '–';
  const combo = s.match(/(\d+)\s*Combined Total.*?(\d+)\s*-\s*Hatchery\s*-\s*marked\s*(\d+)\s*-\s*Wild/i);
  if (combo) {
    const [, n, h, w] = combo;
    if (w !== '0') return `${t('limit.perDay', { n })} · ${t('limit.hatcheryWild', { h, w })}`;
    return isZh(lang) ? `${t('limit.perDay', { n })}（${t('limit.hatchery')}）` : `${t('limit.perDay', { n })} (${t('limit.hatchery')})`;
  }
  if (/^\d+$/.test(s)) return s === '0' ? '0' : t('limit.perDay', { n: s });
  return s;
}

/** [6,7,9,10,11] → "29-6, 29-7, 29-9 – 29-11" */
function compactSubs(list: number[]): string {
  const out: string[] = [];
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j - i >= 2 ? `29-${sorted[i]} – 29-${sorted[j]}` : sorted.slice(i, j + 1).map((n) => `29-${n}`).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}

/* ------------------------------------------------------------------ */

export function RulesPanel({ data, isoDate }: { data: AppData; isoDate: string }) {
  const { t, lang } = useI18n();
  const sun = sunTimes(isoDate);
  const loc = lang === 'en' ? 'en-CA' : lang === 'zh-Hant' ? 'zh-HK' : 'zh-CN';
  const fmt = (d: Date) => d.toLocaleTimeString(loc, { timeZone: 'America/Vancouver', hour: 'numeric', minute: '2-digit' });
  const r = data.region2;
  const sentences = (list: string[]) =>
    list.map((s, i) => {
      const x = sentence(lang, s);
      return (
        <li key={i}>
          {x.text} {!x.translated && <Untranslated />}
        </li>
      );
    });

  return (
    <div className="rules-panel">
      {sun && (
        <p className="sun"><IconSun /> {t('hours.on', { date: formatISODate(lang, isoDate), start: fmt(sun.rise), end: fmt(sun.set) })}</p>
      )}
      <h3>{t('rules.general')}</h3>
      <ul className="bullets">{sentences(r.general)}</ul>
      <h3>{t('rules.closures')}</h3>
      <ul className="bullets">{sentences(r.preamble)}</ul>
      <ul className="bullets">
        <li>{t('rules.licence')}</li>
        <li>{t('rules.hatchery')}</li>
      </ul>
      <h3>{t('rules.data')}</h3>
      <Freshness data={data} />
      <h3>{t('rules.sources')}</h3>
      <ul className="links">
        <li><a href={r.source} target="_blank" rel="noopener noreferrer">{t('rules.region2')} <IconExternal /></a></li>
        <li><a href={salmonTabUrl(data.area29)} target="_blank" rel="noopener noreferrer">{t('tidal.salmonTab')} <IconExternal /></a></li>
        <li><a href="https://notices.dfo-mpo.gc.ca/fns-sap/index-eng.cfm" target="_blank" rel="noopener noreferrer">{t('rules.notices')} <IconExternal /></a></li>
      </ul>
      <p className="disclaimer">{t('rules.disclaimer')}</p>
    </div>
  );
}

