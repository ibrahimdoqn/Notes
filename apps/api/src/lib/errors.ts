import type { ErrorCode } from '@camnotlar/shared';

export class ApiError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string) {
    super(message);
  }
}

export const badRequest = (m: string) => new ApiError(400, 'bad_request', m);
export const unauthorized = (m = 'Oturum açman gerekiyor.') => new ApiError(401, 'unauthorized', m);
export const forbidden = (m = 'Bu işlem için yetkin yok.') => new ApiError(403, 'forbidden', m);
export const notFound = (m = 'Kayıt bulunamadı.') => new ApiError(404, 'not_found', m);
