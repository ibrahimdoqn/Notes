/** Görünüm ayarlarını belge köküne uygular (tema, gece modu, cam yoğunluğu, yazı). */
import { $ } from '../lib/dom.ts';
import { P } from '../state.ts';

export const sysDark = matchMedia('(prefers-color-scheme: dark)');
const toM = (s: string) => {
  const [h, m] = String(s).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function isNight(d = new Date()): boolean {
  const m = d.getHours() * 60 + d.getMinutes();
  const a = toM(P.from);
  const b = toM(P.to);
  return a <= b ? m >= a && m < b : m >= a || m < b;
}

export function isDark(): boolean {
  const r = document.documentElement;
  if (r.dataset.mode) return r.dataset.mode === 'dark';
  if (r.dataset.theme === 'dark' || r.dataset.theme === 'light') return r.dataset.theme === 'dark';
  return sysDark.matches;
}

export function applyPrefs(): void {
  const r = document.documentElement;
  let m: string = P.mode;
  if (m === 'sched') m = isNight() ? 'dark' : 'light';
  if (m === 'auto') delete r.dataset.mode;
  else r.dataset.mode = m;
  r.dataset.accent = P.theme;
  r.dataset.glass = P.glass;
  r.dataset.font = P.font;
  r.dataset.size = P.size;
  r.toggleAttribute('data-oled', !!P.oled);
  r.toggleAttribute('data-still', !P.motion);
  r.toggleAttribute('data-nopv', !P.preview);
  const d = isDark();
  $('#night use').setAttribute('href', d ? '#i-sun' : '#i-moon');
  $('#night').title = d ? 'Gündüz moduna geç' : 'Gece moduna geç';
  // Tarayıcı çubuğu rengi: etkin temanın arka planı.
  const bg = getComputedStyle(document.body).backgroundColor;
  document.querySelectorAll('meta[name=theme-color]').forEach((x) => x.setAttribute('content', bg));
}
