import { describe, expect, it } from 'vitest';
import { diffHtml, wordDiff } from '../src/lib/diff.ts';
import { convertLegacy, isLegacy } from '../src/store/legacy.ts';
import { seed } from '../src/store/seed.ts';

describe('sözcük farkı', () => {
  it('eklenen ve silinen sözcükleri işaretler', () => {
    const html = diffHtml(wordDiff('süt ve ekmek', 'süt, peynir ve ekmek'));
    expect(html).toContain('<del>süt</del>');
    expect(html).toContain('<ins>peynir </ins>ve ekmek');
  });
});

describe('prototip verisinin taşınması', () => {
  it('eski biçimi tanır ve klasör bağlarını korur', () => {
    const legacy = {
      folders: [{ id: 'is', name: 'İş' }],
      notes: [{ id: 'a1', f: 'is', pin: 1, up: 1000, cr: 900, html: '<div>Not</div><script>x</script>', del: 0 }],
    };
    expect(isLegacy(legacy)).toBe(true);
    const out = convertLegacy(legacy);
    expect(out.notes[0]?.folderId).toBe(out.folders[0]?.id);
    expect(out.notes[0]?.html).toBe('<div>Not</div>');
    expect(out.notes[0]?.pinned).toBe(true);
    expect(out.notes[0]?.trashedAt).toBeNull();
  });

  it('yeni biçimdeki yedeği eski sanmaz', () => {
    expect(isLegacy({ folders: [], notes: [{ id: 'x', folderId: null, html: '' }] })).toBe(false);
  });

  it('örnek notlar sözleşmeye uygun', () => {
    const s = seed();
    expect(s.notes).toHaveLength(7);
    expect(new Set(s.notes.map((n) => n.folderId)).size).toBe(4);
  });
});
