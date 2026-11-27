/** Tek biçimli hata yanıtı: {"error": {"code": "...", "message": "..."}} */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'email_taken'
  | 'invalid_credentials'
  | 'weak_password'
  | 'pwned_password'
  | 'signup_closed'
  | 'invalid_invite'
  | 'token_reused'
  | 'rate_limited'
  | 'too_many_changes'
  | 'internal';

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

export const MIN_PASSWORD = 10;
