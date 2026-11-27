/** Tek biçimli hata yanıtı: {"error": {"code": "...", "message": "..."}} */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'username_taken'
  | 'invalid_username'
  | 'last_admin'
  | 'too_large'
  | 'invalid_credentials'
  | 'weak_password'
  | 'pwned_password'
  | 'setup_done'
  | 'token_reused'
  | 'rate_limited'
  | 'too_many_changes'
  | 'internal';

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

export const MIN_PASSWORD = 10;

/** Kullanıcı adı: 3–32 karakter, küçük harf, rakam, nokta, tire, alt çizgi; harf ya da rakamla başlar. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const normalizeUsername = (s: unknown): string => (typeof s === 'string' ? s.trim().toLocaleLowerCase('tr').replace(/ı/g, 'i') : '');
