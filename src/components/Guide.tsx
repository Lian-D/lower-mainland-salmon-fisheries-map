'use client';

import { AdiposeCompare, SalmonArt, type FishKind } from './SalmonArt';
import { useI18n } from './i18n-context';

const KINDS: FishKind[] = ['Chinook', 'Coho', 'Chum', 'Pink', 'Sockeye'];

export function Guide({ highlight }: { highlight?: FishKind | null }) {
  const { t, lang } = useI18n();
  return (
    <div className="guide">
      <p className="hint">{t('guide.intro')}</p>

      <article className="fish-card hatchery">
        <h3>{t('guide.hatchery.title')}</h3>
        <AdiposeCompare wildLabel={t('guide.hatchery.wild')} markedLabel={t('guide.hatchery.marked')} />
        <p>{t('guide.hatchery.body')}</p>
      </article>

      {KINDS.map((k) => (
        <article key={k} className={`fish-card${highlight === k ? ' hl' : ''}`} id={`fish-${k}`}>
          <div className="fish-head">
            <h3>{t(`species.${k}`)}</h3>
            {lang !== 'en' && <span className="fish-en">{k}</span>}
          </div>
          <SalmonArt kind={k} className="fish-art" />
          <dl className="fish-meta">
            <div><dt>{t('guide.aka')}</dt><dd>{t(`fish.${k}.aka`)}</dd></div>
            <div><dt>{t('guide.size')}</dt><dd>{t(`fish.${k}.size`)}</dd></div>
          </dl>
          <ul className="marks">
            {[1, 2, 3].map((i) => <li key={i}>{t(`fish.${k}.m${i}`)}</li>)}
          </ul>
        </article>
      ))}
    </div>
  );
}
