/**
 * UUIDv7: ilk 48 bit milisaniye zaman damgası, kalanı rastgele.
 * Zamana göre sıralanabilir; çevrimdışı üretilip sunucuya aynı kimlikle gönderilebilir.
 */
let lastMs = 0;
let seq = 0;

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function uuidv7(now: number = Date.now()): string {
  const b = randomBytes(16);
  // Aynı (veya geri giden) milisaniyede monotonluk için 12 bitlik sayaç; taşarsa zamanı bir ilerlet.
  if (now <= lastMs) {
    seq++;
    if (seq > 0xfff) { lastMs++; seq = 0; }
    now = lastMs;
  } else {
    lastMs = now;
    seq = ((b[6] ?? 0) << 3) & 0x7ff;
  }
  let ms = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  b[6] = 0x70 | (seq >> 8);
  b[7] = seq & 0xff;
  b[8] = 0x80 | ((b[8] ?? 0) & 0x3f);
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);
