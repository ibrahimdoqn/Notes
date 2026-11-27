/**
 * Not içerik sözleşmesi: editörün ürettiği HTML alt kümesi.
 *
 *   blok:   div, h2, ul, ol, li, br
 *   satır:  b, i, u, s
 *   sınıf:  ul.check (kontrol listesi), li.done (işaretli madde)
 *   ekler:  <img class="att" data-att="UUID" alt="ad">           (resim)
 *           <span class="file" data-att="UUID">dosya.pdf</span>  (diğer dosyalar)
 *
 * Aynı kurallar sunucuda (kayıtta), web'de (yapıştırma / yedek geri yükleme)
 * ve test örneklerinde kullanılır. DOM gerektirmez; Node ve tarayıcıda çalışır.
 */

export const ALLOWED_TAGS = ['div', 'h2', 'ul', 'ol', 'li', 'br', 'b', 'i', 'u', 's', 'img', 'span'] as const;
export const ALLOWED_CLASSES: Record<string, readonly string[]> = { ul: ['check'], li: ['done'] };

type Tag = (typeof ALLOWED_TAGS)[number];
const ALLOWED = new Set<string>(ALLOWED_TAGS);
const ALIAS: Record<string, Tag> = {
  strong: 'b', em: 'i', strike: 's', del: 's', ins: 'u',
  p: 'div', h1: 'h2', h3: 'h2', h4: 'h2', h5: 'h2', h6: 'h2',
  section: 'div', article: 'div', blockquote: 'div', pre: 'div', header: 'div', footer: 'div',
};
/** İçeriğiyle birlikte tamamen atılan etiketler. */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'head', 'title', 'textarea', 'select']);
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'area', 'base', 'col', 'source', 'track', 'embed', 'param']);
const BLOCK = new Set(['div', 'h2', 'ul', 'ol', 'li', 'br']);

const TOKEN_RE = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>?|<\?[^>]*>?|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
const attrRe = (name: string) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
const CLASS_RE = attrRe('class');
const ATT_RE = attrRe('data-att');
const ALT_RE = attrRe('alt');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const attr = (re: RegExp, attrs: string): string | null => {
  const m = re.exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null;
};
/** Ek kimliği (data-att) geçerli bir UUID ise küçük harfle döner. */
const attId = (attrs: string): string | null => {
  const v = attr(ATT_RE, attrs);
  return v && UUID_RE.test(v) ? v.toLowerCase() : null;
};
const ENTITY_RE = /&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/gi;

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', deg: '°',
};

export function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Metni çözüp yeniden kaçışlar: geçerli varlıklar korunur, çıplak & ve < güvenli hâle gelir. */
const safeText = (s: string): string => escapeHtml(decodeEntities(s)).replace(/ /g, '&nbsp;');

function classFor(tag: Tag, attrs: string): string {
  const allowed = ALLOWED_CLASSES[tag];
  if (!allowed) return '';
  const m = CLASS_RE.exec(attrs);
  if (!m) return '';
  const list = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').split(/\s+/).filter((c) => allowed.includes(c));
  return list.length ? ` class="${[...new Set(list)].join(' ')}"` : '';
}

interface Token { kind: 'text' | 'open' | 'close'; tag?: string; attrs?: string; text?: string }

function* tokenize(html: string): Generator<Token> {
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(html); m; m = TOKEN_RE.exec(html)) {
    if (m.index > last) yield { kind: 'text', text: html.slice(last, m.index) };
    last = TOKEN_RE.lastIndex;
    const name = m[1];
    if (!name) continue; // yorum, doctype, işleme talimatı
    yield { kind: m[0][1] === '/' ? 'close' : 'open', tag: name.toLowerCase(), attrs: m[2] ?? '' };
  }
  if (last < html.length) yield { kind: 'text', text: html.slice(last) };
}

/**
 * Sözleşmeye uygun, güvenli HTML üretir. İzin verilmeyen etiketler kaldırılır ama
 * metinleri korunur; sınıf dışındaki tüm öznitelikler atılır; açık kalan etiketler kapatılır.
 */
export function sanitizeNoteHtml(input: string, maxLength = 1_000_000): string {
  const html = String(input ?? '').slice(0, maxLength);
  const out: string[] = [];
  const stack: Tag[] = [];
  let drop: string | null = null;
  let dropDepth = 0;

  for (const t of tokenize(html)) {
    if (drop) {
      if (t.tag === drop) dropDepth += t.kind === 'open' ? 1 : -1;
      if (dropDepth <= 0) drop = null;
      continue;
    }
    if (t.kind === 'text') {
      out.push(safeText(t.text ?? ''));
      continue;
    }
    const raw = t.tag as string;
    if (DROP_WITH_CONTENT.has(raw)) {
      if (t.kind === 'open' && !VOID.has(raw)) { drop = raw; dropDepth = 1; }
      continue;
    }
    if (raw === 'hr' && t.kind === 'open') { out.push('<br>'); continue; }
    if (raw === 'img') {
      // Yalnızca ek resimleri: src gibi dış adresler hiçbir zaman saklanmaz.
      const id = t.kind === 'open' ? attId(t.attrs ?? '') : null;
      if (id) out.push(`<img class="att" data-att="${id}" alt="${escapeHtml((attr(ALT_RE, t.attrs ?? '') ?? '').slice(0, 200))}">`);
      continue;
    }
    if (raw === 'span') {
      // Dosya eki rozeti; diğer span'ler açılıp metni korunur.
      const id = t.kind === 'open' ? attId(t.attrs ?? '') : null;
      if (t.kind === 'open' && id && !stack.includes('span')) { out.push(`<span class="file" data-att="${id}">`); stack.push('span'); }
      else if (t.kind === 'close' && stack[stack.length - 1] === 'span') { out.push('</span>'); stack.pop(); }
      continue;
    }
    const tag = (ALLOWED.has(raw) ? raw : ALIAS[raw]) as Tag | undefined;
    if (!tag) continue;
    if (tag === 'br') { if (t.kind === 'open') out.push('<br>'); continue; }
    if (t.kind === 'open') {
      // li yalnızca liste içinde anlamlı; dışarıdaysa div'e çevir.
      const eff: Tag = tag === 'li' && !stack.some((s) => s === 'ul' || s === 'ol') ? 'div' : tag;
      if (eff === 'li' && stack[stack.length - 1] === 'li') { out.push('</li>'); stack.pop(); }
      out.push(`<${eff}${eff === tag ? classFor(eff, t.attrs ?? '') : ''}>`);
      stack.push(eff);
    } else {
      const idx = stack.lastIndexOf(tag);
      if (idx < 0) continue;
      while (stack.length > idx) out.push(`</${stack.pop()}>`);
    }
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join('');
}

/** HTML'den düz metin: blok sınırları satır sonu olur. */
export function htmlToPlain(html: string): string {
  const parts: string[] = [];
  let drop: string | null = null;
  for (const t of tokenize(String(html ?? ''))) {
    if (drop) { if (t.kind === 'close' && t.tag === drop) drop = null; continue; }
    if (t.kind === 'text') parts.push(decodeEntities(t.text ?? ''));
    else if (t.kind === 'open' && DROP_WITH_CONTENT.has(t.tag as string) && !VOID.has(t.tag as string)) drop = t.tag as string;
    else if (t.tag === 'br' || (t.kind === 'close' && (BLOCK.has(t.tag as string) || ALIAS[t.tag as string] === 'div' || ALIAS[t.tag as string] === 'h2'))) parts.push('\n');
  }
  return parts.join('').replace(/ /g, ' ');
}

export interface NoteMeta {
  title: string;
  snippet: string;
  plain: string;
  words: number;
}

/** İlk dolu satır başlık, kalanı önizleme metni olur (Apple Notes davranışı). */
export function noteMeta(html: string): NoteMeta {
  const plain = htmlToPlain(html);
  const lines = plain.split('\n').map((s) => s.trim()).filter(Boolean);
  const title = (lines[0] ?? 'Yeni Not').slice(0, 120);
  const snippet = lines.slice(1).join(' ').slice(0, 140) || 'Ek metin yok';
  const words = lines.join(' ').split(/\s+/).filter(Boolean).length;
  return { title, snippet, plain: lines.join('\n'), words };
}

/** Metni ve eki olmayan not boş sayılır (yalnızca resim içeren not boş değildir). */
export const isBlankHtml = (html: string): boolean => htmlToPlain(html).trim() === '' && !/data-att=/i.test(html);

/** HTML'de geçen ek kimlikleri. */
export function attachmentIds(html: string): string[] {
  const ids = new Set<string>();
  for (const m of String(html ?? '').matchAll(/data-att="([0-9a-f-]{36})"/gi)) ids.add((m[1] as string).toLowerCase());
  return [...ids];
}

export const isImageMime = (m: string) => /^image\/(png|jpe?g|gif|webp|avif|heic|heif|bmp)$/i.test(m);
