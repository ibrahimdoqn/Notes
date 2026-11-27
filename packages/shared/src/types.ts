/**
 * Sunucu, web ve Android istemcilerinin ortak konuştuğu veri tipleri.
 * Tüm zaman damgaları epoch milisaniyedir (number). Kimlikler istemcide üretilen UUIDv7'dir.
 */

export type Platform = 'web' | 'android';

export interface Folder {
  id: string;
  name: string;
  sortOrder: number;
  version: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  folderId: string | null;
  html: string;
  title: string;
  snippet: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  /** Son Silinenler'e taşındığı an; null ise not etkin. */
  trashedAt: number | null;
  version: number;
}

export type Entity = 'note' | 'folder' | 'settings';
export type Op = 'upsert' | 'delete';

/** İstemcinin gönderdiği tek bir değişiklik. */
export interface ChangeIn {
  entity: Entity;
  id: string;
  op: Op;
  /** İstemcinin bu kaydı en son gördüğü sunucu sürümü; yeni kayıtta 0. */
  baseVersion: number;
  data?: NoteInput | FolderInput | SettingsData;
}

export interface NoteInput {
  folderId: string | null;
  html: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
}

export interface FolderInput {
  name: string;
  sortOrder: number;
}

export type SettingsData = Record<string, unknown>;

export type PushStatus = 'ok' | 'conflict' | 'gone' | 'invalid';

export interface PushResult {
  entity: Entity;
  id: string;
  status: PushStatus;
  /** Sunucudaki yeni sürüm (ok/conflict). */
  version?: number;
  /** Çakışmada üstüne yazılan sürümün saklandığı yeni notun kimliği. */
  conflictCopyId?: string;
  /** Sunucunun düzelttiği alanlar (ör. klasörü silinmiş not varsayılan klasöre alındı). */
  data?: Note | Folder;
  message?: string;
}

export interface PushRequest {
  changes: ChangeIn[];
}

export interface PushResponse {
  results: PushResult[];
  seq: number;
}

/** Sunucudan çekilen değişiklik; data kaydın güncel hâlidir. */
export interface ChangeOut {
  seq: number;
  entity: Entity;
  id: string;
  op: Op;
  version: number;
  data?: Note | Folder | SettingsData;
}

export interface PullResponse {
  changes: ChangeOut[];
  seq: number;
  hasMore: boolean;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface Device {
  id: string;
  name: string;
  platform: Platform;
  lastSeenAt: number;
  current?: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
  deviceName: string;
  platform: Platform;
  /** Aynı cihaz yeniden giriş yaparsa önceki cihaz kimliği. */
  deviceId?: string;
}

/** İlk kurulum: hiç kullanıcı yokken ilk yönetici hesabı. */
export interface SetupRequest extends LoginRequest {
  displayName?: string;
}

/** Yönetim arayüzünden kullanıcı oluşturma / güncelleme. */
export interface AdminUserInput {
  username?: string;
  password?: string;
  displayName?: string;
  isAdmin?: boolean;
}

export interface AdminUser extends User {
  notes: number;
  attachmentBytes: number;
  lastSeenAt: number | null;
  devices: number;
}

/** Not içindeki ek: dosya sunucuda diskte, kaydı veritabanında. */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  createdAt: number;
}

export interface AuthResponse {
  accessToken: string;
  /** Yalnızca web dışı istemcilere gövdede döner; web'de HttpOnly çerezdedir. */
  refreshToken?: string;
  expiresIn: number;
  user: User;
  deviceId: string;
}

export interface Revision {
  id: string;
  noteId: string;
  version: number;
  html: string;
  title: string;
  deviceName: string | null;
  createdAt: number;
}

export interface ServerInfo {
  name: 'camnotlar';
  apiVersion: number;
  /** Hiç kullanıcı yoksa true: /yonetim sayfasından ilk yönetici oluşturulur. */
  needsSetup: boolean;
  maxAttachmentBytes: number;
}

/** Bu istemci sürümünün konuştuğu API sürümü. Sunucu daha yeniyse istemci uyarı gösterir. */
export const API_VERSION = 1;
export const PUSH_LIMIT = 100;
export const PULL_LIMIT = 500;
export const REVISION_KEEP = 50;
