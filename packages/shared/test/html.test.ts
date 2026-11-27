import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlToPlain, noteMeta, sanitizeNoteHtml } from '../src/html.ts';

const dir = join(import.meta.dirname, '..', 'fixtures');
const read = (p: string) => readFileSync(join(dir, p), 'utf8').trim();

describe('HTML sözleşmesi', () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    it(`${f} temizlemede değişmez`, () => {
      const html = read(f);
      expect(sanitizeNoteHtml(html)).toBe(html);
    });
  }
  for (const f of readdirSync(join(dir, 'dirty')).filter((x) => !x.includes('.expected'))) {
    it(`dirty/${f} beklenen çıktıya temizlenir`, () => {
      expect(sanitizeNoteHtml(read(`dirty/${f}`))).toBe(read(`dirty/${f.replace('.html', '.expected.html')}`));
    });
  }

  it('tehlikeli içerik kalmaz', () => {
    const evil = [
      '<svg onload=alert(1)>', '<a href="javascript:alert(1)">x</a>', '<div onmouseover="a()">x</div>',
      '<<script>script>alert(1)<</script>/script>', '<div class="x" style="background:url(x)">y</div>',
      '<iframe src="//evil"></iframe>', '<!--<script>-->x', '<scr<script>ipt>alert(1)</script>',
      '<li class="done"><img src=x onerror=1>',
    ];
    for (const e of evil) {
      const out = sanitizeNoteHtml(e);
      expect(out).not.toMatch(/<(?!\/?(div|h2|ul|ol|li|br|b|i|u|s)\b)/i);
      expect(out).not.toMatch(/\son\w+=|style=|href=|src=/i);
    }
  });

  it('açık kalan etiketleri kapatır, başıboş kapanışları atar', () => {
    expect(sanitizeNoteHtml('<div><b>a')).toBe('<div><b>a</b></div>');
    expect(sanitizeNoteHtml('a</b></div>b')).toBe('ab');
    expect(sanitizeNoteHtml('<li>dışarıda</li>')).toBe('<div>dışarıda</div>');
  });

  it('başlık ve önizleme çıkarır', () => {
    const m = noteMeta(read('basic.html'));
    expect(m.title).toBe('Haftalık ürün toplantısı');
    expect(m.snippet).toBe('Gündem Kasım metrikleri Mobil sürüm 2.4 yayın planı');
    expect(noteMeta('<div><br></div>').title).toBe('Yeni Not');
    expect(htmlToPlain('<div>A &amp; B</div><div>C</div>')).toBe('A & B\nC\n');
  });
});

describe('ekler', () => {
  it('yalnızca resimli not boş sayılmaz, kimlikler bulunur', async () => {
    const { isBlankHtml, attachmentIds } = await import('../src/html.ts');
    const html = '<div><img class="att" data-att="01a21c30-0000-7000-8000-0000000000aa" alt=""></div>';
    expect(isBlankHtml(html)).toBe(false);
    expect(attachmentIds(read('attachments.html'))).toEqual(['01a21c30-0000-7000-8000-0000000000aa', '01a21c30-0000-7000-8000-0000000000bb']);
    expect(noteMeta(read('attachments.html')).snippet).toBe('Ek: fatura.pdf');
  });
});
