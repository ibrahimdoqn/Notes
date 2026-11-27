import Dexie, { type Table } from 'dexie';
import type { ChangeIn, Entity, Folder, Note } from '@camnotlar/shared';

/** Sunucuya gönderilmeyi bekleyen değişiklik. Anahtar "entity:id"; aynı kayda ardışık yazımlar birleşir. */
export interface OutboxItem {
  key: string;
  entity: Entity;
  id: string;
  op: ChangeIn['op'];
  baseVersion: number;
  data?: ChangeIn['data'];
  /** Her yazımda artar; push yanıtı gelince yalnızca gönderilen rev hâlâ güncelse kayıt silinir. */
  rev: number;
  at: number;
}

/** Ek dosyası: yerelde saklanır; uploaded=0 ise sunucuya yüklenmeyi bekler. */
export interface BlobRow {
  id: string;
  blob: Blob;
  name: string;
  mime: string;
  size: number;
  uploaded: 0 | 1;
  at: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class CamDb extends Dexie {
  notes!: Table<Note, string>;
  folders!: Table<Folder, string>;
  outbox!: Table<OutboxItem, string>;
  meta!: Table<MetaRow, string>;
  blobs!: Table<BlobRow, string>;

  constructor(name = 'camnotlar') {
    super(name);
    this.version(1).stores({
      notes: 'id, folderId, updatedAt',
      folders: 'id',
      outbox: 'key, at',
      meta: 'key',
    });
    this.version(2).stores({ blobs: 'id, uploaded' });
  }
}

export let db = new CamDb();
/** Testler için ayrı veritabanı. */
export const useDb = (d: CamDb) => {
  db = d;
};

export async function getMeta<T>(key: string, def: T): Promise<T> {
  const r = await db.meta.get(key);
  return r ? (r.value as T) : def;
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value });
