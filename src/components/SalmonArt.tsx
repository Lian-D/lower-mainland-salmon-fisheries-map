import { useId } from 'react';

export type FishKind = 'Chinook' | 'Coho' | 'Chum' | 'Pink' | 'Sockeye';

interface Look {
  back: string;
  side: string;
  belly: string;
  fin: string;
  outline: string;
  hump: number; // 0..1
  kype: number; // 0..1 hooked jaw
  spots: { back: number; dorsal: number; upper: number; lower: number; size: [number, number] };
  bars?: string; // chum calico bars
  head?: string; // sockeye green head
  whiteFinTips?: boolean;
  gum?: string;
}

/** Spawning-phase (river) colours, the way anglers usually see them in Region 2. */
const LOOKS: Record<FishKind, Look> = {
  Chinook: {
    back: '#3b4334', side: '#7b5a45', belly: '#cdbba6', fin: '#4a3f33', outline: '#2a2a22',
    hump: 0.15, kype: 0.45,
    spots: { back: 46, dorsal: 7, upper: 12, lower: 12, size: [2.2, 3.6] }, gum: '#111',
  },
  Coho: {
    back: '#25392e', side: '#b8323a', belly: '#d9b0aa', fin: '#3a2a2a', outline: '#1f1a1a',
    hump: 0.12, kype: 1,
    spots: { back: 30, dorsal: 5, upper: 10, lower: 0, size: [1.8, 3] }, gum: '#e8e2da',
  },
  Chum: {
    back: '#3e4d36', side: '#7e8a4e', belly: '#e3dcc6', fin: '#4b4a33', outline: '#272b1f',
    hump: 0.1, kype: 0.7, bars: '#6d2d54', whiteFinTips: true,
    spots: { back: 0, dorsal: 0, upper: 0, lower: 0, size: [0, 0] },
  },
  Pink: {
    back: '#2f3d45', side: '#a49ea0', belly: '#efe9e3', fin: '#3d4247', outline: '#22282c',
    hump: 1, kype: 0.6,
    spots: { back: 22, dorsal: 3, upper: 9, lower: 9, size: [3.4, 5.6] },
  },
  Sockeye: {
    back: '#a2232a', side: '#d6362c', belly: '#c95a4a', fin: '#5d6a32', outline: '#3d1a18',
    hump: 0.45, kype: 0.9, head: '#5f7a3c',
    spots: { back: 0, dorsal: 0, upper: 0, lower: 0, size: [0, 0] },
  },
};

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bodyPath(h: number) {
  const H = 26 * h;
  return [
    'M18,88',
    'C30,70 46,62 70,56',
    `C110,${46 - H} 140,${41 - H} 175,${42 - H}`,
    `C230,${44 - H * 0.6} 290,58 338,74`,
    'C352,66 372,46 404,30',
    'C396,52 388,70 380,85',
    'C388,100 396,118 404,142',
    'C372,124 352,104 338,96',
    'C300,112 240,128 170,128',
    'C120,128 80,120 58,110',
    'C40,104 24,96 18,88 Z',
  ].join(' ');
}

export function SalmonArt({ kind, adipose = true, scar = false, ring = false, className }: { kind: FishKind; adipose?: boolean; scar?: boolean; ring?: boolean; className?: string }) {
  const L = LOOKS[kind];
  const id = useId().replace(/:/g, '');
  const H = 26 * L.hump;
  const rand = rng(kind.length * 9973 + kind.charCodeAt(0));

  const spots: { x: number; y: number; rx: number; ry: number; r: number }[] = [];
  const add = (n: number, x0: number, x1: number, y0: number, y1: number) => {
    for (let i = 0; i < n; i++) {
      const [a, b] = L.spots.size;
      const rx = a + rand() * (b - a);
      spots.push({ x: x0 + rand() * (x1 - x0), y: y0 + rand() * (y1 - y0), rx, ry: rx * (0.6 + rand() * 0.25), r: rand() * 60 - 30 });
    }
  };
  add(L.spots.back, 80, 336, 30 - H, 80);
  add(L.spots.dorsal, 164, 204, 18 - H, 42 - H);
  add(L.spots.upper, 350, 402, 32, 82);
  add(L.spots.lower, 350, 402, 90, 140);

  const dorsal = `M158,${44 - H} C164,${26 - H} 170,${16 - H} 178,${14 - H} C190,${26 - H} 200,${38 - H} 208,${47 - H * 0.7} Z`;

  return (
    <svg viewBox="0 0 420 160" className={className} role="img" aria-label={`${kind} salmon illustration`}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.back} />
          <stop offset="0.5" stopColor={L.side} />
          <stop offset="1" stopColor={L.belly} />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <path d={bodyPath(L.hump)} />
        </clipPath>
      </defs>

      {/* fins behind the body */}
      <path d={dorsal} fill={L.fin} stroke={L.outline} strokeWidth="1" />
      {adipose && <path d="M290,63 C294,52 306,50 313,61 Z" fill={L.fin} stroke={L.outline} strokeWidth="1" />}
      <path d="M196,126 C204,140 214,147 227,147 C221,136 213,128 207,125 Z" fill={L.fin} stroke={L.outline} strokeWidth="1" />
      <path d="M268,117 C274,132 286,141 301,141 C297,128 291,118 285,112 Z" fill={L.fin} stroke={L.outline} strokeWidth="1" />
      {L.whiteFinTips && (
        <>
          <path d="M215,143 C220,146 224,147 227,147 C225,143 223,140 221,138 Z" fill="#f4f1ea" />
          <path d="M290,138 C294,140 298,141 301,141 C300,137 298,134 296,131 Z" fill="#f4f1ea" />
        </>
      )}

      {/* body */}
      <path d={bodyPath(L.hump)} fill={`url(#g${id})`} stroke={L.outline} strokeWidth="1.4" />
      <g clipPath={`url(#c${id})`}>
        {L.head && <path d="M0,0 H86 C100,40 100,90 86,140 H0 Z" fill={L.head} />}
        {L.bars &&
          Array.from({ length: 9 }, (_, i) => {
            const x = 112 + i * 25;
            return <path key={i} d={`M${x},60 C${x + 6},80 ${x - 4},100 ${x + 4},126 L${x + 12},126 C${x + 4},100 ${x + 14},80 ${x + 9},60 Z`} fill={L.bars} opacity="0.55" />;
          })}
        <rect x="0" y="0" width="420" height="160" fill={`url(#s${id})`} />
        {spots.map((s, i) => (
          <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} transform={`rotate(${s.r} ${s.x} ${s.y})`} fill="#141414" opacity="0.88" />
        ))}
        {/* lateral line */}
        <path d="M92,84 C180,82 260,82 338,85" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="1" />
      </g>
      {/* healed scar where the adipose fin was clipped */}
      {!adipose && scar && <path d="M293,61 C299,58 305,58 311,61" fill="none" stroke="#d9a0a0" strokeWidth="3" strokeLinecap="round" />}

      {/* pectoral fin over the body */}
      <path d="M80,111 C92,125 108,134 125,134 C113,124 99,114 89,107 Z" fill={L.fin} stroke={L.outline} strokeWidth="1" opacity="0.95" />
      {/* head details */}
      <path d="M86,62 C99,80 99,100 84,114" fill="none" stroke={L.outline} strokeOpacity="0.55" strokeWidth="1.5" />
      <path d="M18,88 C30,93 44,93 57,88" fill="none" stroke={L.outline} strokeWidth="1.3" />
      {L.kype > 0 && (
        <path
          d={`M20,89 C${17 - 5 * L.kype},${93 + 3 * L.kype} ${18 - 3 * L.kype},${98 + 4 * L.kype} ${24},${97 + 3 * L.kype} C30,96 36,94 42,92 Z`}
          fill={L.head ?? L.side}
          stroke={L.outline}
          strokeWidth="1"
        />
      )}
      {L.gum && <path d="M24,91 C32,94 40,94 48,92" fill="none" stroke={L.gum} strokeWidth="2.4" strokeLinecap="round" />}
      <circle cx="47" cy="76" r="6" fill="#e9dfc9" stroke={L.outline} strokeWidth="1" />
      <circle cx="47.6" cy="76.4" r="3.4" fill="#111" />
      <circle cx="46" cy="74.8" r="1" fill="#fff" />
      {ring && <circle cx="301" cy="57" r="17" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="5 4" />}
    </svg>
  );
}

/** Close-up for the hatchery-mark explanation */
export function AdiposeCompare({ wildLabel, markedLabel }: { wildLabel: string; markedLabel: string }) {
  return (
    <div className="adipose">
      <figure>
        <SalmonArt kind="Coho" ring className="fish-art" />
        <figcaption>
          <span className="pin-dot" aria-hidden /> {wildLabel}
        </figcaption>
      </figure>
      <figure>
        <SalmonArt kind="Coho" adipose={false} scar ring className="fish-art" />
        <figcaption>
          <span className="pin-dot clipped" aria-hidden /> {markedLabel}
        </figcaption>
      </figure>
    </div>
  );
}
