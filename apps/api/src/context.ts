import type { Config } from './config.ts';
import type { Db } from './db/pool.ts';
import type { TokenSigner } from './auth/tokens.ts';
import type { Hub } from './lib/hub.ts';

/** Rotaların paylaştığı bağımlılıklar. */
export interface Ctx {
  cfg: Config;
  db: Db;
  signer: TokenSigner;
  hub: Hub;
}
