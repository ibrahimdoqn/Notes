/** Cihazlar arası eşitlenen görünüm ayarları ve varsayılanları. */
export type Mode = 'auto' | 'light' | 'dark' | 'sched';
export type ThemeId = 'amber' | 'ocean' | 'forest' | 'rose' | 'lav' | 'graphite';
export type GlassId = 'mat' | 'bal' | 'clear';
export type FontId = 'sys' | 'serif' | 'mono';
export type SizeId = 's' | 'm' | 'l';
export type SortId = 'up' | 'cr' | 'ttl';

export interface Prefs {
  mode: Mode;
  from: string;
  to: string;
  oled: boolean;
  theme: ThemeId;
  glass: GlassId;
  motion: boolean;
  font: FontId;
  size: SizeId;
  sort: SortId;
  group: boolean;
  preview: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  mode: 'auto',
  from: '20:00',
  to: '07:00',
  oled: false,
  theme: 'amber',
  glass: 'bal',
  motion: true,
  font: 'sys',
  size: 'm',
  sort: 'up',
  group: true,
  preview: true,
};

export const THEMES: ReadonlyArray<{ id: ThemeId; name: string; color: string; light: string }> = [
  { id: 'amber', name: 'Kehribar', color: '#e8a900', light: '#ffd36b' },
  { id: 'ocean', name: 'Okyanus', color: '#0a84ff', light: '#8fe3ff' },
  { id: 'forest', name: 'Orman', color: '#30b15b', light: '#d8f0a0' },
  { id: 'rose', name: 'Gül', color: '#ff4f7b', light: '#ffc9a8' },
  { id: 'lav', name: 'Lavanta', color: '#8e6cf0', light: '#ffc2e0' },
  { id: 'graphite', name: 'Grafit', color: '#8e8e93', light: '#e5e5ea' },
];

const ENUMS: Partial<Record<keyof Prefs, readonly string[]>> = {
  mode: ['auto', 'light', 'dark', 'sched'],
  theme: THEMES.map((t) => t.id),
  glass: ['mat', 'bal', 'clear'],
  font: ['sys', 'serif', 'mono'],
  size: ['s', 'm', 'l'],
  sort: ['up', 'cr', 'ttl'],
};
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Bilinmeyen anahtarları atar, geçersiz değerleri varsayılana çeker. */
export function normalizePrefs(input: unknown): Prefs {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PREFS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    const v = src[key];
    const def = DEFAULT_PREFS[key];
    if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v;
    } else if (key === 'from' || key === 'to') {
      if (typeof v === 'string' && TIME_RE.test(v)) out[key] = v;
    } else if (typeof v === 'string' && ENUMS[key]?.includes(v)) out[key] = v;
  }
  return out as unknown as Prefs;
}
