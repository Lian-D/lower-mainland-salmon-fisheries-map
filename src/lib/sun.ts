/** Sunrise/sunset (NOAA approximation), accurate to a minute or two – plenty for "daylight hours". */
export function sunTimes(isoDate: string, lat = 49.2, lng = -122.6): { rise: Date; set: Date } | null {
  const [y, m, d] = isoDate.split('-').map(Number);
  const rad = Math.PI / 180;
  const dayOfYear = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
  const calc = (rising: boolean) => {
    const lngHour = lng / 15;
    const t = dayOfYear + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634;
    L = (L + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
    RA = (RA + 360) % 360;
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    let H = rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
    H /= 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = (((T - lngHour) % 24) + 24) % 24;
    return new Date(Date.UTC(y, m - 1, d) + UT * 3600e3);
  };
  const rise = calc(true);
  let set = calc(false);
  if (!rise || !set) return null;
  if (set < rise) set = new Date(set.getTime() + 864e5);
  return { rise, set };
}
