'use client';

import { AdiposeCompare, type FishKind } from './SalmonArt';
import { useI18n } from './i18n-context';

const KINDS: FishKind[] = ['Chinook', 'Coho', 'Chum', 'Pink', 'Sockeye'];

/** Public-domain photos by the U.S. FDA, cropped from Wikimedia Commons. */
const PHOTOS: Record<FishKind, { src: string; w: number; h: number; commons: string }> = {
  Chinook: { src: '/fish/chinook.jpg', w: 900, h: 260, commons: 'File:Oncorhynchus_tshawytscha_(FDA_241).jpg' },
  Coho: { src: '/fish/coho.jpg', w: 900, h: 268, commons: 'File:Oncorhynchus_kisutch_(FDA_244).jpg' },
  Chum: { src: '/fish/chum.jpg', w: 900, h: 217, commons: 'File:Oncorhynchus_keta_(FDA_243).jpg' },
  Pink: { src: '/fish/pink.jpg', w: 900, h: 255, commons: 'File:Oncorhynchus_gorbuscha_(FDA_245).jpg' },
  Sockeye: { src: '/fish/sockeye.jpg', w: 900, h: 275, commons: 'File:Oncorhynchus_nerka_(FDA_242)_-_51700807635.jpg' },
};

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
          <figure className="fish-photo">
            <img src={PHOTOS[k].src} width={PHOTOS[k].w} height={PHOTOS[k].h} loading="lazy" alt={`${k} salmon (Oncorhynchus)`} />
            <figcaption>
              <a href={`https://commons.wikimedia.org/wiki/${PHOTOS[k].commons}`} target="_blank" rel="noopener noreferrer">{t('guide.photo')}</a>
            </figcaption>
          </figure>
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
