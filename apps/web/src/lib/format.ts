const H = 36e5;
const D = 864e5;
const F = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('tr-TR', o);
const fT = F({ hour: '2-digit', minute: '2-digit' });
const fD = F({ day: 'numeric', month: 'short', year: 'numeric' });
const fM = F({ month: 'long', year: 'numeric' });
const fW = F({ weekday: 'long' });
export const fLong = F({ dateStyle: 'long', timeStyle: 'short' });

const sod = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const ago = (t: number) => Math.round((sod(Date.now()) - sod(t)) / D);

/** Liste grupları: Bugün, Dün, Önceki 7 gün, Önceki 30 gün, ay adı. */
export const group = (t: number) => {
  const d = ago(t);
  return d < 1 ? 'Bugün' : d < 2 ? 'Dün' : d < 7 ? 'Önceki 7 gün' : d < 30 ? 'Önceki 30 gün' : fM.format(t);
};
export const short = (t: number) => {
  const d = ago(t);
  return d < 1 ? fT.format(t) : d < 2 ? 'Dün' : d < 7 ? fW.format(t) : fD.format(t);
};
/** "şimdi", "3 dk önce", "14:05" */
export const relTime = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 45) return 'şimdi';
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 12 * 3600) return fT.format(t);
  return short(t);
};
/** Bayt sayısını okunur boyuta çevirir: 12 KB, 3,4 MB. */
export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export { H, D };
