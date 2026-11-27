import { randomBytes } from 'node:crypto';
import { isUuid, uuidv7, type AuthResponse, type Device, type Platform, type User } from '@camnotlar/shared';
import { tx, type Db, type Queryable } from '../db/pool.ts';
import { ApiError, badRequest, unauthorized } from '../lib/errors.ts';
import type { Ctx } from '../context.ts';
import { logChange } from '../sync/log.ts';
import { checkPassword, dummyVerify, hashPassword, verifyPassword } from './password.ts';
import { newRefreshToken, sha256 } from './tokens.ts';

interface UserRow { id: string; email: string; password_hash: string; display_name: string; is_admin: boolean; created_at: Date }

export const toUser = (r: UserRow): User => ({
  id: r.id, email: r.email, displayName: r.display_name, isAdmin: r.is_admin, createdAt: r.created_at.getTime(),
});

export const normEmail = (e: unknown): string => {
  const s = typeof e === 'string' ? e.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 254) throw badRequest('Geçerli bir e-posta adresi gir.');
  return s;
};

const cleanName = (s: unknown, def: string, max = 60) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : def);

export async function createUser(
  db: Queryable, email: string, password: string, opts: { displayName?: string; isAdmin?: boolean; hibp: boolean },
): Promise<User> {
  const e = normEmail(email);
  await checkPassword(password, opts.hibp);
  const id = uuidv7();
  const ph = await hashPassword(password);
  try {
    const { rows } = await db.query<UserRow>(
      'INSERT INTO users(id, email, password_hash, display_name, is_admin) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [id, e, ph, cleanName(opts.displayName, e.split('@')[0] ?? ''), !!opts.isAdmin],
    );
    const folderId = uuidv7();
    await db.query("INSERT INTO folders(id, user_id, name, sort_order) VALUES ($1, $2, 'Notlar', 0)", [folderId, id]);
    await logChange(db, id, 'folder', folderId, 1, 'upsert');
    return toUser(rows[0] as UserRow);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'email_taken', 'Bu e-posta ile zaten bir hesap var.');
    throw err;
  }
}

/** Davet kodunu doğrular ve kullanılmış işaretler. */
export async function consumeInvite(db: Queryable, code: unknown, email: string): Promise<void> {
  if (typeof code !== 'string' || !code) throw new ApiError(403, 'signup_closed', 'Bu sunucuda kayıt kapalı; bir davet kodu gerekiyor.');
  const { rowCount } = await db.query(
    `UPDATE invites SET used_at = now() WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
       AND (email IS NULL OR email = $2)`,
    [sha256(code.trim()), email],
  );
  if (!rowCount) throw new ApiError(403, 'invalid_invite', 'Davet kodu geçersiz ya da süresi dolmuş.');
}

export async function createInvite(db: Queryable, email: string | null, by: string | null, days = 7): Promise<string> {
  const code = randomBytes(12).toString('base64url');
  await db.query('INSERT INTO invites(code_hash, email, created_by, expires_at) VALUES ($1,$2,$3, now() + make_interval(days => $4))', [
    sha256(code), email, by, days,
  ]);
  return code;
}

interface SessionOut { response: AuthResponse; refreshToken: string }

/** Cihazı bulur ya da oluşturur, yeni oturum açar. */
export async function openSession(
  ctx: Ctx, db: Queryable, user: User, device: { id?: string; name: unknown; platform: unknown },
): Promise<SessionOut> {
  const platform: Platform = device.platform === 'android' ? 'android' : 'web';
  const name = cleanName(device.name, platform === 'android' ? 'Android' : 'Tarayıcı');
  let deviceId: string | undefined;
  if (isUuid(device.id)) {
    const r = await db.query('UPDATE devices SET name=$3, platform=$4, last_seen_at=now() WHERE id=$1 AND user_id=$2 RETURNING id', [
      device.id, user.id, name, platform,
    ]);
    if (r.rowCount) {
      deviceId = device.id;
      // Aynı cihazdaki eski oturumlar kapanır; tek cihaz = tek oturum.
      await db.query('UPDATE sessions SET revoked_at=now() WHERE device_id=$1 AND revoked_at IS NULL', [deviceId]);
    }
  }
  if (!deviceId) {
    deviceId = uuidv7();
    await db.query('INSERT INTO devices(id, user_id, name, platform) VALUES ($1,$2,$3,$4)', [deviceId, user.id, name, platform]);
  }
  const refresh = newRefreshToken();
  const sid = uuidv7();
  await db.query(
    `INSERT INTO sessions(id, user_id, device_id, refresh_hash, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(days => $5))`,
    [sid, user.id, deviceId, sha256(refresh), ctx.cfg.refreshTtlDays],
  );
  const accessToken = await ctx.signer.sign({ sub: user.id, sid, did: deviceId, adm: user.isAdmin });
  return { refreshToken: refresh, response: { accessToken, expiresIn: ctx.signer.ttlSec, user, deviceId } };
}

export async function login(ctx: Ctx, body: Record<string, unknown>): Promise<SessionOut> {
  const email = normEmail(body.email);
  const pw = typeof body.password === 'string' ? body.password : '';
  const { rows } = await ctx.db.query<UserRow>('SELECT * FROM users WHERE email=$1', [email]);
  const row = rows[0];
  if (!row) {
    await dummyVerify(pw);
    throw new ApiError(401, 'invalid_credentials', 'E-posta ya da parola hatalı.');
  }
  if (!(await verifyPassword(row.password_hash, pw))) throw new ApiError(401, 'invalid_credentials', 'E-posta ya da parola hatalı.');
  return tx(ctx.db, (c) =>
    openSession(ctx, c, toUser(row), { id: body.deviceId as string, name: body.deviceName, platform: body.platform }),
  );
}

export async function register(ctx: Ctx, body: Record<string, unknown>): Promise<SessionOut> {
  const email = normEmail(body.email);
  return tx(ctx.db, async (c) => {
    if (!ctx.cfg.allowSignup) await consumeInvite(c, body.inviteCode, email);
    const user = await createUser(c, email, String(body.password ?? ''), {
      displayName: body.displayName as string, hibp: ctx.cfg.hibpCheck,
    });
    return openSession(ctx, c, user, { id: body.deviceId as string, name: body.deviceName, platform: body.platform });
  });
}

/**
 * Yenileme belirtecini döndürür. Önceki (zaten kullanılmış) belirteç tekrar gelirse
 * çalınmış sayılır ve o cihazın oturumu tamamen kapatılır.
 */
export async function refresh(ctx: Ctx, token: string | undefined): Promise<SessionOut> {
  if (!token) throw unauthorized();
  const h = sha256(token);
  // İptal işlemin dışında yapılır ki hata fırlatılınca geri alınmasın.
  const reused = await ctx.db.query('UPDATE sessions SET revoked_at=now() WHERE prev_refresh_hash=$1 AND revoked_at IS NULL', [h]);
  if (reused.rowCount) throw new ApiError(401, 'token_reused', 'Oturum güvenlik nedeniyle kapatıldı; yeniden giriş yap.');
  return tx(ctx.db, async (c) => {
    const { rows } = await c.query<{ id: string; user_id: string; device_id: string }>(
      `SELECT id, user_id, device_id FROM sessions WHERE refresh_hash=$1 AND revoked_at IS NULL AND expires_at > now() FOR UPDATE`, [h],
    );
    const s = rows[0];
    if (!s) throw unauthorized('Oturumun süresi dolmuş; yeniden giriş yap.');
    const next = newRefreshToken();
    await c.query(
      `UPDATE sessions SET prev_refresh_hash=refresh_hash, refresh_hash=$2, expires_at=now() + make_interval(days => $3) WHERE id=$1`,
      [s.id, sha256(next), ctx.cfg.refreshTtlDays],
    );
    await c.query('UPDATE devices SET last_seen_at=now() WHERE id=$1', [s.device_id]);
    const u = (await c.query<UserRow>('SELECT * FROM users WHERE id=$1', [s.user_id])).rows[0];
    if (!u) throw unauthorized();
    const user = toUser(u);
    const accessToken = await ctx.signer.sign({ sub: user.id, sid: s.id, did: s.device_id, adm: user.isAdmin });
    return { refreshToken: next, response: { accessToken, expiresIn: ctx.signer.ttlSec, user, deviceId: s.device_id } };
  });
}

export async function logout(db: Db, sid: string): Promise<void> {
  await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [sid]);
}

export async function sessionActive(db: Queryable, sid: string): Promise<boolean> {
  const r = await db.query('SELECT 1 FROM sessions WHERE id=$1 AND revoked_at IS NULL AND expires_at > now()', [sid]);
  return !!r.rowCount;
}

export async function listDevices(db: Queryable, userId: string, current: string): Promise<Device[]> {
  const { rows } = await db.query<{ id: string; name: string; platform: Platform; last_seen_at: Date }>(
    `SELECT d.id, d.name, d.platform, d.last_seen_at FROM devices d
      WHERE d.user_id=$1 AND EXISTS (SELECT 1 FROM sessions s WHERE s.device_id=d.id AND s.revoked_at IS NULL AND s.expires_at > now())
      ORDER BY d.last_seen_at DESC`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, platform: r.platform, lastSeenAt: r.last_seen_at.getTime(), current: r.id === current }));
}

export async function revokeDevice(db: Queryable, userId: string, deviceId: string): Promise<boolean> {
  const r = await db.query(
    `UPDATE sessions SET revoked_at=now() WHERE device_id=$1 AND user_id=$2 AND revoked_at IS NULL`, [deviceId, userId],
  );
  return !!r.rowCount;
}

export async function changePassword(ctx: Ctx, userId: string, sid: string, oldPw: unknown, newPw: unknown): Promise<void> {
  const u = (await ctx.db.query<UserRow>('SELECT * FROM users WHERE id=$1', [userId])).rows[0];
  if (!u || !(await verifyPassword(u.password_hash, String(oldPw ?? '')))) {
    throw new ApiError(401, 'invalid_credentials', 'Mevcut parola hatalı.');
  }
  await checkPassword(String(newPw ?? ''), ctx.cfg.hibpCheck);
  await ctx.db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [userId, await hashPassword(String(newPw))]);
  // Diğer tüm cihazlardan çıkış yapılır.
  await ctx.db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL', [userId, sid]);
}
