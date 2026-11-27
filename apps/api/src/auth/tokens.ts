import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { importPKCS8, jwtVerify, SignJWT, type CryptoKey, type KeyObject } from 'jose';

export interface AccessClaims {
  sub: string; // kullanıcı
  sid: string; // oturum
  did: string; // cihaz
  adm?: boolean;
}

type Key = CryptoKey | KeyObject;

export interface TokenSigner {
  sign(c: AccessClaims): Promise<string>;
  verify(token: string): Promise<AccessClaims>;
  ttlSec: number;
}

/** Ed25519 özel anahtarı (PKCS8 PEM) yoksa geçici bir anahtar üretilir; yeniden başlatmada oturumlar düşer. */
export async function createSigner(pem: string | undefined, ttlSec: number, warn: (m: string) => void): Promise<TokenSigner> {
  let priv: Key;
  let pub: Key;
  if (pem) {
    priv = await importPKCS8(pem, 'EdDSA');
    const { createPublicKey, createPrivateKey } = await import('node:crypto');
    pub = createPublicKey(createPrivateKey(pem));
  } else {
    warn('JWT_PRIVATE_KEY tanımlı değil; geçici anahtar üretildi. Üretimde deploy/init.sh ile anahtar oluştur.');
    const kp = generateKeyPairSync('ed25519');
    priv = kp.privateKey;
    pub = kp.publicKey;
  }
  return {
    ttlSec,
    sign: (c) =>
      new SignJWT({ sid: c.sid, did: c.did, ...(c.adm ? { adm: true } : {}) })
        .setProtectedHeader({ alg: 'EdDSA' })
        .setSubject(c.sub)
        .setIssuedAt()
        .setIssuer('camnotlar')
        .setExpirationTime(`${ttlSec}s`)
        .sign(priv),
    async verify(token) {
      const { payload } = await jwtVerify(token, pub, { issuer: 'camnotlar', algorithms: ['EdDSA'] });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.did !== 'string') {
        throw new Error('eksik talep');
      }
      return { sub: payload.sub, sid: payload.sid, did: payload.did, adm: payload.adm === true };
    },
  };
}

/** 256 bitlik rastgele yenileme belirteci; veritabanında yalnızca SHA-256 karması tutulur. */
export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
