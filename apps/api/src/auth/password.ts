import { createHash } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { MIN_PASSWORD } from '@camnotlar/shared';
import { ApiError } from '../lib/errors.ts';

// OWASP önerisi: Argon2id, 19 MiB bellek, 2 tur.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTS);

export async function verifyPassword(hashStr: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}

/** Sabit süreli olmayan e-posta yoklamasını zorlaştırmak için kullanıcı yokken de karma doğrulanır. */
let dummy: Promise<string> | undefined;
export const dummyVerify = async (pw: string) => {
  dummy ??= hashPassword('camnotlar-dummy-password');
  await verifyPassword(await dummy, pw);
};

/** HIBP k-anonimlik: SHA-1'in yalnızca ilk 5 karakteri gönderilir. Ağ hatasında engellemez. */
export async function isPwned(pw: string, timeoutMs = 2500): Promise<boolean> {
  const sha = createHash('sha1').update(pw).digest('hex').toUpperCase();
  const prefix = sha.slice(0, 5);
  const suffix = sha.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'camnotlar' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split('\n').some((l) => {
      const [s, c] = l.trim().split(':');
      return s === suffix && Number(c) > 0;
    });
  } catch {
    return false;
  }
}

export async function checkPassword(pw: string, hibp: boolean): Promise<void> {
  if (typeof pw !== 'string' || [...pw].length < MIN_PASSWORD) {
    throw new ApiError(400, 'weak_password', `Parola en az ${MIN_PASSWORD} karakter olmalı.`);
  }
  if (hibp && (await isPwned(pw))) {
    throw new ApiError(400, 'pwned_password', 'Bu parola bilinen bir veri sızıntısında görülmüş; başka bir parola seç.');
  }
}
