'use client';

import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { fraserScope, statusOf, subScope, tidalStatus, TIDAL_FRASER_SUBS, type Status } from '@/lib/rules';
import type { Area29Data, LatLng, RiverGeometry, Species, WaterVM } from '@/lib/types';
import { useI18n } from './i18n-context';
import { waterName } from '@/i18n';
import { BBOX } from '@/lib/geo';

/** Panning is limited to the area the map has data for (BBOX: Squamish, Powell River lakes, Fraser past Hope) plus a margin. */
const VIEW_MARGIN = 0.3; // degrees
const [S, W, N, E] = BBOX.split(',').map(Number);
const VIEW_BOUNDS: [[number, number], [number, number]] = [[S - VIEW_MARGIN, W - VIEW_MARGIN], [N + VIEW_MARGIN, E + VIEW_MARGIN]];

export type LayerId = 'light' | 'dark' | 'street' | 'topo' | 'satellite';

export const STATUS_COLOR: Record<Status, string> = { open: '#12a150', nr: '#f29a12', off: '#8b7cf6', banned: '#e5484d' };
export const TIDAL_COLOR: Record<Area29Data['status'], string> = { closed: '#e5484d', open: '#12a150', nr: '#f29a12', mixed: '#f29a12', unknown: '#8a97a0' };
export const TIDAL_ID = 'tidal-fraser';
export const subId = (n: number) => `29-${n}`;
export const parseSubId = (id: string | null) => (id && /^29-\d+$/.test(id) ? Number(id.slice(3)) : null);
const TIDAL_PIN: LatLng = [49.165, -122.62];

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const ATTR = 'Tiles © Esri — Esri, HERE, Garmin, USGS, NGA · Rivers © OpenStreetMap contributors';
const LAYERS: Record<LayerId, { base: string; labels?: string; nativeMax: number }> = {
  light: { base: 'Canvas/World_Light_Gray_Base', labels: 'Canvas/World_Light_Gray_Reference', nativeMax: 16 },
  dark: { base: 'Canvas/World_Dark_Gray_Base', labels: 'Canvas/World_Dark_Gray_Reference', nativeMax: 16 },
  street: { base: 'World_Street_Map', nativeMax: 19 },
  topo: { base: 'World_Topo_Map', nativeMax: 19 },
  satellite: { base: 'World_Imagery', labels: 'Reference/World_Boundaries_and_Places', nativeMax: 19 },
};

interface Props {
  waters: WaterVM[];
  area29: Area29Data;
  mmdd: string;
  filter: Species;
  selectedId: string | null;
  onSelect: (id: string) => void;
  layer: LayerId;
  focus: { id: string; n: number } | null;
  /** Space covered by floating UI, so fitBounds keeps the river visible */
  padding: { tl: [number, number]; br: [number, number] };
  onRiversState: (s: { loading: boolean; missing: string[] }) => void;
}

interface SectionLayers { waterId: string; entryIdx: number[]; main: Leaflet.Path[]; halo: Leaflet.Path[] }

export default function MapView(props: Props) {
  const { waters, area29, mmdd, filter, selectedId, onSelect, layer, focus, padding, onRiversState } = props;
  const { lang } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const Lr = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const tiles = useRef<Leaflet.Layer[]>([]);
  const sections = useRef<Map<string, SectionLayers>>(new Map());
  const tidal = useRef<{ main: Leaflet.Path[]; halo: Leaflet.Path[] }>({ main: [], halo: [] });
  const pins = useRef<Map<string, Leaflet.CircleMarker>>(new Map());
  const subs = useRef<Map<number, Leaflet.Polygon>>(new Map());
  const [geo, setGeo] = useState<RiverGeometry | null>(null);
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  /* init */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current || map.current) return;
      Lr.current = L;
      const bounds = L.latLngBounds(VIEW_BOUNDS);
      const m = L.map(el.current, {
        zoomControl: false, attributionControl: true, preferCanvas: false, worldCopyJump: false,
        maxBounds: bounds, maxBoundsViscosity: 1.0,
      }).setView([49.35, -122.75], 9);
      // Zooming out stops once the whole area fits on screen. Normal zooms stay whole steps so tiles are sharp;
      // only this outermost level may be a half step, so the area fits snugly instead of jumping a full level out.
      const fitMinZoom = () => {
        const z = m.getZoom(), size = m.getSize();
        const nw = m.project(bounds.getNorthWest(), z), se = m.project(bounds.getSouthEast(), z);
        const fit = m.getScaleZoom(Math.min(size.x / (se.x - nw.x), size.y / (se.y - nw.y)), z);
        m.setMinZoom(Math.max(6, Math.floor(fit * 2) / 2));
      };
      fitMinZoom();
      m.on('resize', fitMinZoom);
      // From that half step, "+" goes to the next whole level (8.5 → 9) instead of rounding past it (→ 10)
      const zoomIn = m.zoomIn.bind(m);
      m.zoomIn = (delta?: number, options?: Leaflet.ZoomOptions) =>
        m.getZoom() % 1 ? m.setZoom(Math.ceil(m.getZoom()), options) : zoomIn(delta, options);
      L.control.zoom({ position: 'bottomright' }).addTo(m);
      m.attributionControl.setPrefix(false);
      for (const [name, z] of [['subareas', 395], ['context', 405], ['halo', 410], ['rivers', 420], ['pins', 640]] as const) {
        m.createPane(name).style.zIndex = String(z);
      }
      const zoomClass = () => {
        el.current?.classList.toggle('zoom-lo', m.getZoom() < 10);
        el.current?.classList.toggle('zoom-hi', m.getZoom() >= 12);
      };
      m.on('zoomend', zoomClass);
      zoomClass();
      map.current = m;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  /* base layer */
  useEffect(() => {
    const L = Lr.current;
    const m = map.current;
    if (!L || !m) return;
    tiles.current.forEach((t) => m.removeLayer(t));
    const cfg = LAYERS[layer];
    const opts = { maxZoom: 19, maxNativeZoom: cfg.nativeMax, attribution: ATTR, crossOrigin: true } as Leaflet.TileLayerOptions;
    tiles.current = [L.tileLayer(`${ESRI}${cfg.base}/MapServer/tile/{z}/{y}/{x}`, opts).addTo(m)];
    if (cfg.labels) tiles.current.push(L.tileLayer(`${ESRI}${cfg.labels}/MapServer/tile/{z}/{y}/{x}`, { ...opts, pane: 'overlayPane', attribution: '' }).addTo(m));
    m.getContainer().dataset.layer = layer;
  }, [layer, ready]);

  /* river geometry: fetched once from our server (which downloaded it once from OSM) */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stop = false;
    let version = '';
    let tries = 0;
    const load = async () => {
      try {
        const res = await fetch('/api/rivers', { cache: 'no-store' });
        const g = (await res.json()) as RiverGeometry;
        if (stop) return;
        if (g.version && g.version !== version) {
          version = g.version;
          if (g.ready || g.subareas?.length) setGeo(g);
        }
        onRiversState({ loading: !g.ready, missing: g.missing ?? [] });
        if (g.ready && g.subareasReady) return; // everything's in
      } catch {
        onRiversState({ loading: true, missing: [] });
      }
      if (++tries < 120) timer = setTimeout(load, 30000);
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* draw rivers + pins (once geometry/map ready) */
  useEffect(() => {
    const L = Lr.current;
    const m = map.current;
    if (!L || !m) return;
    const group = L.layerGroup().addTo(m);

    for (const sa of geo?.subareas ?? []) {
      const poly = L.polygon(sa.polygons as unknown as Leaflet.LatLngExpression[][][], { pane: 'subareas', weight: 1.5, dashArray: '5 5', fillOpacity: 0.1 }).addTo(group);
      poly.on('click', () => selectRef.current(subId(sa.sub)));
      L.marker(sa.center as Leaflet.LatLngExpression, {
        pane: 'subareas',
        interactive: false,
        icon: L.divIcon({ className: 'sub-label', html: `<span>29-${sa.sub}</span>`, iconSize: [0, 0] }),
      }).addTo(group);
      subs.current.set(sa.sub, poly);
    }

    const drawn = new Set<string>();
    if (geo?.ready) {
      L.polyline(geo.context as Leaflet.LatLngExpression[][], { pane: 'context', color: '#7f97a6', weight: 2, opacity: 0.75, interactive: false, className: 'rv-context' }).addTo(group);

      for (const w of waters) {
        for (const s of w.sections) {
          const lines = geo.sections[s.id];
          const polys = geo.lakes[s.id];
          const shape = geo.shapes?.[s.id];
          if (!lines && !polys) continue;
          const rec: SectionLayers = { waterId: w.id, entryIdx: s.entryIdx, main: [], halo: [] };
          drawn.add(w.id);
          if (shape) {
            // the river's real outline, cut to the open stretch (shown when zoomed in)
            rec.main.push(L.polygon(shape as unknown as Leaflet.LatLngExpression[][][], { pane: 'rivers', weight: 1.5, fillOpacity: 0.6, lineJoin: 'round', className: 'sec-shape', fillRule: 'nonzero' }).addTo(group));
          }
          if (lines) {
            // bold line: always for creeks without an outline, and zoomed out for the rest
            const cls = shape ? 'sec-line shaped' : 'sec-line';
            rec.halo.push(L.polyline(lines as Leaflet.LatLngExpression[][], { pane: 'halo', color: '#fff', weight: 10, opacity: 0.9, interactive: false, lineCap: 'round', className: cls }).addTo(group));
            rec.main.push(L.polyline(lines as Leaflet.LatLngExpression[][], { pane: 'rivers', weight: 5, lineCap: 'round', lineJoin: 'round', className: cls }).addTo(group));
          }
          if (polys) rec.main.push(L.polygon(polys as Leaflet.LatLngExpression[][], { pane: 'rivers', weight: 2.5, fillOpacity: 0.35 }).addTo(group));
          rec.main.forEach((p) => p.on('click', () => selectRef.current(w.id)));
          sections.current.set(s.id, rec);
        }
      }

      // the Fraser subareas already show the tidal Fraser; draw the line only if they never downloaded
      if (geo.tidal.length && !geo.subareas?.length) {
        tidal.current = {
          halo: [L.polyline(geo.tidal as Leaflet.LatLngExpression[][], { pane: 'halo', color: '#fff', weight: 10, opacity: 0.9, interactive: false }).addTo(group)],
          main: [L.polyline(geo.tidal as Leaflet.LatLngExpression[][], { pane: 'rivers', weight: 5, lineCap: 'round' }).addTo(group)],
        };
        tidal.current.main.forEach((p) => p.on('click', () => selectRef.current(TIDAL_ID)));
      }
    }

    // dots only for waters that have nothing else on the map (or while river data is still downloading)
    for (const w of waters) {
      if (!w.pin || (geo?.ready && drawn.has(w.id))) continue;
      const pin = L.circleMarker(w.pin as Leaflet.LatLngExpression, { pane: 'pins', radius: 7, color: '#fff', weight: 2.5, fillOpacity: 1 }).addTo(group);
      pin.on('click', () => selectRef.current(w.id));
      pins.current.set(w.id, pin);
    }
    if (!geo?.subareas?.length) {
      const tp = L.circleMarker(TIDAL_PIN as Leaflet.LatLngExpression, { pane: 'pins', radius: 7, color: '#fff', weight: 2.5, fillOpacity: 1 }).addTo(group);
      tp.on('click', () => selectRef.current(TIDAL_ID));
      pins.current.set(TIDAL_ID, tp);
    }

    return () => {
      group.remove();
      sections.current.clear();
      pins.current.clear();
      tidal.current = { main: [], halo: [] };
      subs.current.clear();
    };
  }, [geo, waters, ready]);

  /* colours, selection and tooltips */
  useEffect(() => {
    const byId = new Map(waters.map((w) => [w.id, w]));
    const halo = layer === 'dark' || layer === 'satellite' ? '#0d1a20' : '#ffffff';
    for (const rec of sections.current.values()) {
      const w = byId.get(rec.waterId)!;
      const st = statusOf(rec.entryIdx.map((i) => w.entries[i]), mmdd, filter);
      const sel = selectedId === rec.waterId;
      const dim = selectedId && !sel;
      rec.main.forEach((p) => {
        const area = !!Lr.current && p instanceof Lr.current.Polygon;
        p.setStyle(
          area
            ? { color: STATUS_COLOR[st], fillColor: STATUS_COLOR[st], weight: sel ? 3 : 1.5, opacity: dim ? 0.5 : 1, fillOpacity: dim ? 0.25 : sel ? 0.8 : st === 'off' ? 0.4 : 0.6, dashArray: st === 'banned' ? '6 5' : undefined }
            : { color: STATUS_COLOR[st], fillColor: STATUS_COLOR[st], weight: sel ? 8 : st === 'off' ? 4 : 5, opacity: dim ? 0.55 : 1, dashArray: st === 'banned' ? '9 8' : undefined },
        );
        p.unbindTooltip().bindTooltip(waterName(lang, w.name).primary, { sticky: true, className: 'glass-tip' });
        if (sel) p.bringToFront();
      });
      rec.halo.forEach((p) => p.setStyle({ color: halo, weight: sel ? 15 : 10, opacity: dim ? 0.5 : 0.9 }));
    }
    const tc = TIDAL_COLOR[tidalStatus(area29, fraserScope(), mmdd, filter)];
    const selSub = parseSubId(selectedId);
    for (const [n, poly] of subs.current) {
      const c = TIDAL_COLOR[tidalStatus(area29, subScope(n), mmdd, filter)];
      const on = selSub === n || (selectedId === TIDAL_ID && TIDAL_FRASER_SUBS.includes(n));
      poly.setStyle({ color: c, fillColor: c, weight: on ? 3 : 1.5, fillOpacity: on ? 0.28 : 0.1, dashArray: on ? undefined : '5 5' });
      poly.unbindTooltip().bindTooltip(`${lang === 'en' ? 'Area 29 · Subarea' : lang === 'zh-Hant' ? '第29區・分區' : '第29区・分区'} 29-${n}`, { sticky: true, className: 'glass-tip' });
    }
    const tsel = selectedId === TIDAL_ID;
    tidal.current.main.forEach((p) => {
      p.setStyle({ color: tc, weight: tsel ? 8 : 5, opacity: selectedId && !tsel ? 0.55 : 1 });
      p.unbindTooltip().bindTooltip(lang === 'en' ? 'Fraser River – tidal (Area 29)' : lang === 'zh-Hant' ? '菲沙河潮汐水域（第29區）' : '菲沙河潮汐水域（第29区）', { sticky: true, className: 'glass-tip' });
    });
    tidal.current.halo.forEach((p) => p.setStyle({ color: halo, weight: tsel ? 15 : 10 }));

    for (const [id, pin] of pins.current) {
      const color = id === TIDAL_ID ? tc : STATUS_COLOR[statusOf(byId.get(id)!.entries, mmdd, filter)];
      pin.setStyle({ fillColor: color, radius: selectedId === id ? 10 : 7 });
      const name = id === TIDAL_ID ? (lang === 'en' ? 'Fraser River – tidal (Area 29)' : lang === 'zh-Hant' ? '菲沙河潮汐水域' : '菲沙河潮汐水域') : waterName(lang, byId.get(id)!.name).primary;
      pin.unbindTooltip().bindTooltip(name, { direction: 'top', offset: [0, -8], className: 'glass-tip' });
    }
  }, [waters, area29, mmdd, filter, selectedId, lang, geo, ready, layer]);

  /* focus a water when chosen from the list */
  useEffect(() => {
    const L = Lr.current;
    const m = map.current;
    if (!L || !m || !focus) return;
    const opts = { paddingTopLeft: padding.tl, paddingBottomRight: padding.br, maxZoom: 13 } as Leaflet.FitBoundsOptions;
    let bounds: Leaflet.LatLngBounds | null = null;
    const fsub = parseSubId(focus.id);
    if (fsub !== null) {
      const p = subs.current.get(fsub);
      if (p) bounds = p.getBounds();
    } else if (focus.id === TIDAL_ID && subs.current.size) {
      for (const n of TIDAL_FRASER_SUBS) {
        const p = subs.current.get(n);
        if (p) bounds = bounds ? bounds.extend(p.getBounds()) : L.latLngBounds(p.getBounds().getSouthWest(), p.getBounds().getNorthEast());
      }
    } else if (focus.id === TIDAL_ID) {
      tidal.current.main.forEach((p) => (bounds = bounds ? bounds.extend((p as Leaflet.Polyline).getBounds()) : (p as Leaflet.Polyline).getBounds()));
    } else {
      for (const rec of sections.current.values()) {
        if (rec.waterId !== focus.id) continue;
        for (const p of rec.main) {
          const b = (p as Leaflet.Polyline).getBounds();
          bounds = bounds ? bounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
        }
      }
    }
    if (bounds) m.flyToBounds(bounds, { ...opts, duration: 0.8 });
    else {
      const pin = pins.current.get(focus.id);
      if (pin) m.flyToBounds(L.latLngBounds([pin.getLatLng(), pin.getLatLng()]).pad(0.02), { ...opts, maxZoom: 12, duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return <div ref={el} className="map" />;
}
