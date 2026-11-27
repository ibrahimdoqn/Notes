/** OpenAPI belgesi için yeniden kullanılan JSON şemaları. */
export const errorSchema = {
  type: 'object',
  properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } },
} as const;

export const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' }, email: { type: 'string' }, displayName: { type: 'string' }, isAdmin: { type: 'boolean' },
    createdAt: { type: 'number' },
  },
} as const;

export const authResponse = {
  type: 'object',
  properties: {
    accessToken: { type: 'string' }, refreshToken: { type: 'string' }, expiresIn: { type: 'number' },
    deviceId: { type: 'string' }, user: userSchema,
  },
} as const;

export const noteSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' }, folderId: { type: ['string', 'null'] }, html: { type: 'string' }, title: { type: 'string' },
    snippet: { type: 'string' }, pinned: { type: 'boolean' }, createdAt: { type: 'number' }, updatedAt: { type: 'number' },
    trashedAt: { type: ['number', 'null'] }, version: { type: 'number' },
  },
} as const;

export const loginBody = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', maxLength: 254 }, password: { type: 'string', maxLength: 1024 },
    deviceName: { type: 'string', maxLength: 60 }, platform: { type: 'string', enum: ['web', 'android'] },
    deviceId: { type: 'string' }, displayName: { type: 'string', maxLength: 60 }, inviteCode: { type: 'string', maxLength: 100 },
  },
} as const;

export const changeSchema = {
  type: 'object',
  required: ['entity', 'id', 'op', 'baseVersion'],
  properties: {
    entity: { type: 'string', enum: ['note', 'folder', 'settings'] }, id: { type: 'string' },
    op: { type: 'string', enum: ['upsert', 'delete'] }, baseVersion: { type: 'integer', minimum: 0 },
    data: { type: 'object', additionalProperties: true },
  },
} as const;
