'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LANGS, makeT, type Lang } from '@/i18n';
import type { AppData, Species } from '@/lib/types';
import { Guide } from './Guide';
import { I18nContext } from './i18n-context';
import { IconLayers, IconSearch, LogoFish } from './icons';
import type { LayerId } from './MapView';
import { parseSubId, subId, TIDAL_ID } from './MapView';
import { Freshness, Legend, RulesPanel, TidalDetail, WaterDetail, WatersList } from './Panels';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="map map-loading" /> });

const SPECIES: Species[] = ['All', 'Chinook', 'Coho', 'Chum', 'Pink', 'Sockeye'];
const LAYER_IDS: LayerId[] = ['light', 'dark', 'street', 'topo', 'satellite'];
type Tab = 'waters' | 'guide' | 'rules';
type Snap = 'peek' | 'half' | 'full';
const PEEK = 150;

function useMedia(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

const store = {
  get(k: string) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem(k, v); } catch { /* private mode */ }
  },
};

export default function App({ initial, today, initialLang }: { initial: AppData; today: string; initialLang: Lang }) {
  const [data, setData] = useState(initial);
  const [lang, setLang] = useState<Lang>(initialLang);
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<Species>('All');
  const [tab, setTab] = useState<Tab>('waters');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [layer, setLayer] = useState<LayerId>('light');
  const [layerMenu, setLayerMenu] = useState(false);
  const [rivers, setRivers] = useState<{ loading: boolean; missing: string[] }>({ loading: false, missing: [] });
  const [snap, setSnap] = useState<Snap>('peek');
  const [drag, setDrag] = useState(0);
  const [topH, setTopH] = useState(120);
  const mobile = useMedia('(max-width: 899px)');
  const topRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const t = useMemo(() => makeT(lang), [lang]);
  const mmdd = date.slice(5);

  /* restore preferences */
  useEffect(() => {
    const l = store.get('layer') as LayerId | null;
    if (l && LAYER_IDS.includes(l)) setLayer(l);
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setLayer('dark');
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.cookie = `lang=${lang}; path=/; max-age=31536000; samesite=lax`;
    document.title = t('app.title');
  }, [lang, t]);

  /* refresh data when the tab comes back into view (the server re-checks DFO daily) */
  useEffect(() => {
    let last = Date.now();
    const on = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 10 * 60 * 1000) return;
      last = Date.now();
      try {
        const res = await fetch('/api/regulations', { cache: 'no-store' });
        if (res.ok) setData(await res.json());
      } catch { /* offline */ }
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  /* topbar height drives the sheet + map padding */
  useEffect(() => {
    if (!topRef.current) return;
    const ro = new ResizeObserver(([e]) => setTopH(Math.round(e.target.getBoundingClientRect().height)));
    ro.observe(topRef.current);
    return () => ro.disconnect();
  }, []);

  const select = useCallback(
    (id: string, fromMap = false) => {
      setSelected(id);
      setTab('waters');
      if (!fromMap) setFocus({ id, n: Date.now() });
      if (mobile) setSnap((s) => (s === 'peek' ? 'half' : s));
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
    },
    [mobile],
  );

  const water = selected && selected !== TIDAL_ID && parseSubId(selected) === null ? data.waters.find((w) => w.id === selected) ?? null : null;

  /* bottom sheet (mobile) */
  const sheetH = typeof window === 'undefined' ? 600 : window.innerHeight - topH - 16;
  const snapY = (s: Snap) => (s === 'full' ? 0 : s === 'half' ? Math.round(sheetH * 0.5) : Math.max(0, sheetH - PEEK));
  const dragState = useRef<{ y: number; base: number; t: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!mobile) return;
    dragState.current = { y: e.clientY, base: snapY(snap), t: Date.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    setDrag(e.clientY - dragState.current.y);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    dragState.current = null;
    const dy = e.clientY - d.y;
    const v = dy / Math.max(1, Date.now() - d.t); // px/ms
    const pos = d.base + dy;
    let next: Snap;
    if (Math.abs(dy) < 6) next = snap === 'peek' ? 'half' : snap; // tap on handle
    else if (v > 0.6) next = snap === 'full' ? 'half' : 'peek';
    else if (v < -0.6) next = snap === 'peek' ? 'half' : 'full';
    else next = (['full', 'half', 'peek'] as Snap[]).reduce((a, b) => (Math.abs(snapY(b) - pos) < Math.abs(snapY(a) - pos) ? b : a));
    setSnap(next);
    setDrag(0);
  };

  const padding = useMemo(() => {
    if (!mobile) return { tl: [420, topH + 24] as [number, number], br: [70, 30] as [number, number] };
    const visible = sheetH - snapY(snap === 'peek' ? 'half' : snap);
    return { tl: [20, topH + 20] as [number, number], br: [20, Math.min(visible, sheetH * 0.6) + 20] as [number, number] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, topH, snap, sheetH]);

  const panelStyle = mobile
    ? ({ top: topH + 16, transform: `translateY(${Math.max(0, snapY(snap) + drag)}px)`, transition: drag ? 'none' : undefined } as React.CSSProperties)
    : ({ top: topH + 24 } as React.CSSProperties);

  return (
    <I18nContext.Provider value={{ lang, t }}>
      <div className="app" data-lang={lang}>
        <MapView
          waters={data.waters}
          area29={data.area29}
          mmdd={mmdd}
          filter={filter}
          selectedId={selected}
          onSelect={(id) => select(id, true)}
          layer={layer}
          focus={focus}
          padding={padding}
          onRiversState={setRivers}
        />

        <header ref={topRef} className="topbar glass">
          <div className="brand">
            <LogoFish />
            <div>
              <h1>{t('app.title')}</h1>
              <p>{t('app.subtitle')}</p>
            </div>
          </div>
          <div className="controls">
            <label className="date">
              <span className="sr">{t('date')}</span>
              <input id="date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              {date !== today && <button className="chip small" onClick={() => setDate(today)}>{t('today')}</button>}
            </label>
            <div className="chips" role="group" aria-label="Species">
              {SPECIES.map((s) => (
                <button key={s} className={`chip${filter === s ? ' on' : ''}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
                  {t(`species.${s}`)}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label={t('lang.label')}>
              {LANGS.map((l) => (
                <button key={l.id} aria-pressed={lang === l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)} lang={l.id}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="layer-ctl" style={{ top: mobile ? topH + 24 : topH + 24 }}>
          <button className="round glass" aria-label={t('layers')} aria-expanded={layerMenu} onClick={() => setLayerMenu((v) => !v)}>
            <IconLayers />
          </button>
          {layerMenu && (
            <div className="layer-menu glass" role="menu">
              {LAYER_IDS.map((id) => (
                <button key={id} role="menuitemradio" aria-checked={layer === id} className={layer === id ? 'on' : ''}
                  onClick={() => { setLayer(id); store.set('layer', id); setLayerMenu(false); }}>
                  <span className={`swatch sw-${id}`} aria-hidden />{t(`layer.${id}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        {rivers.loading && <div className="toast glass">{t('rivers.loading')}</div>}

        <aside ref={panelRef} className={`panel glass${mobile ? ` sheet sheet-${snap}` : ''}`} style={panelStyle}>
          <div className="panel-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {mobile && <div className="handle" aria-hidden />}
            <nav className="tabs" role="tablist">
              {(['waters', 'guide', 'rules'] as Tab[]).map((k) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { setTab(k); if (k !== 'waters') setSelected(null); if (mobile && snap === 'peek') setSnap('half'); }}>
                  {t(`tab.${k}`)}
                </button>
              ))}
            </nav>
          </div>

          <div className="panel-body" ref={scrollRef} style={mobile ? { paddingBottom: Math.max(0, snapY(snap)) + 24 } : undefined}>
            {tab === 'waters' && !selected && (
              <>
                <label className="search">
                  <IconSearch />
                  <input id="search" type="search" placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => mobile && setSnap('full')} />
                </label>
                <Legend />
                <Freshness data={data} />
                <WatersList data={data} mmdd={mmdd} filter={filter} query={query} onSelect={(id) => select(id)} />
                {rivers.missing.length > 0 && <p className="hint">{t('rivers.missing', { list: rivers.missing.join(', ') })}</p>}
              </>
            )}
            {tab === 'waters' && water && (
              <WaterDetail water={water} mmdd={mmdd} isoDate={date} filter={filter} onBack={() => setSelected(null)} onZoom={() => setFocus({ id: water.id, n: Date.now() })} />
            )}
            {tab === 'waters' && (selected === TIDAL_ID || parseSubId(selected) !== null) && (
              <TidalDetail
                area29={data.area29}
                sub={parseSubId(selected)}
                mmdd={mmdd}
                isoDate={date}
                filter={filter}
                onBack={() => setSelected(null)}
                onZoom={() => setFocus({ id: selected!, n: Date.now() })}
                onPickSub={(n) => select(n === null ? TIDAL_ID : subId(n))}
              />
            )}
            {tab === 'guide' && <Guide highlight={filter === 'All' ? null : filter} />}
            {tab === 'rules' && <RulesPanel data={data} isoDate={date} />}
          </div>
        </aside>
      </div>
    </I18nContext.Provider>
  );
}
