import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from '../src/uuid.ts';
import { normalizePrefs, DEFAULT_PREFS } from '../src/settings.ts';

describe('uuidv7', () => {
  it('geçerli ve zamana göre sıralı', () => {
    const ids = Array.from({ length: 200 }, () => uuidv7());
    ids.forEach((id) => expect(isUuid(id)).toBe(true));
    expect([...ids].sort()).toEqual(ids);
    expect(ids[0]?.[14]).toBe('7');
  });
});

describe('normalizePrefs', () => {
  it('geçersiz değerleri varsayılana çeker', () => {
    expect(normalizePrefs({ theme: 'mor', from: '25:00', oled: 'evet', x: 1 })).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ theme: 'rose', from: '21:30' })).toMatchObject({ theme: 'rose', from: '21:30' });
  });
});
