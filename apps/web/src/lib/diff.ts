import { escapeHtml } from '@camnotlar/shared';

export type Part = { t: 'same' | 'add' | 'del'; s: string };

const tokens = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];

/** Sözcük düzeyinde fark (LCS). Çok uzun metinlerde (> 3000 sözcük) tek parça döner. */
export function wordDiff(a: string, b: string): Part[] {
  const A = tokens(a);
  const B = tokens(b);
  if (A.length * B.length > 9_000_000) return [{ t: 'del', s: a }, { t: 'add', s: b }];
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i] as Uint32Array;
    const next = dp[i + 1] as Uint32Array;
    for (let j = m - 1; j >= 0; j--) row[j] = A[i] === B[j] ? (next[j + 1] as number) + 1 : Math.max(next[j] as number, row[j + 1] as number);
  }
  const out: Part[] = [];
  const push = (t: Part['t'], s: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += s;
    else out.push({ t, s });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push('same', A[i] as string);
      i++;
      j++;
    } else if ((dp[i + 1] as Uint32Array)[j]! >= (dp[i] as Uint32Array)[j + 1]!) push('del', A[i++] as string);
    else push('add', B[j++] as string);
  }
  while (i < n) push('del', A[i++] as string);
  while (j < m) push('add', B[j++] as string);
  return out;
}

export const diffHtml = (parts: Part[]) =>
  parts.map((p) => {
    const s = escapeHtml(p.s).replace(/\n/g, '<br>');
    return p.t === 'same' ? s : p.t === 'add' ? `<ins>${s}</ins>` : `<del>${s}</del>`;
  }).join('');
