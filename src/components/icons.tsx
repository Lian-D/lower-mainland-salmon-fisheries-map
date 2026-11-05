const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconBack = () => (
  <svg {...base} aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
);
export const IconSearch = () => (
  <svg {...base} aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
export const IconLayers = () => (
  <svg {...base} aria-hidden><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>
);
export const IconExternal = () => (
  <svg {...base} width={14} height={14} aria-hidden><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
);
export const IconTarget = () => (
  <svg {...base} width={16} height={16} aria-hidden><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
);
export const IconSun = () => (
  <svg {...base} width={16} height={16} aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const LogoFish = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
    <defs>
      <linearGradient id="lg-logo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff8a5b" />
        <stop offset="1" stopColor="#e5484d" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#lg-logo)" />
    <path d="M6 16c3-5 9-6.5 14-4l5-3-1.6 7 1.6 7-5-3c-5 2.5-11 1-14-4z" fill="#fff" />
    <circle cx="10.5" cy="15.2" r="1.2" fill="#e5484d" />
  </svg>
);
