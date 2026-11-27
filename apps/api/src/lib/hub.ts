/**
 * Kullanıcı başına "değişiklik var" sinyali yayını. Tek api süreci için bellek içi;
 * birden çok api kopyası çalıştırılacaksa bu arayüz Redis pub/sub ile değiştirilebilir.
 */
export interface Listener {
  deviceId: string;
  send(msg: string): void;
}

export class Hub {
  private subs = new Map<string, Set<Listener>>();

  subscribe(userId: string, l: Listener): () => void {
    let set = this.subs.get(userId);
    if (!set) this.subs.set(userId, (set = new Set()));
    set.add(l);
    return () => {
      set.delete(l);
      if (!set.size) this.subs.delete(userId);
    };
  }

  /** Değişikliği yapan cihaz hariç kullanıcının diğer bağlantılarına seq bildirir. */
  publish(userId: string, seq: number, fromDevice?: string): void {
    const msg = JSON.stringify({ type: 'changed', seq });
    for (const l of this.subs.get(userId) ?? []) {
      if (l.deviceId === fromDevice) continue;
      try {
        l.send(msg);
      } catch {
        /* kapanmış bağlantı */
      }
    }
  }

  /** Uzaktan çıkışta o cihazın bağlantılarını kapatır. */
  kick(userId: string, deviceId: string): void {
    for (const l of this.subs.get(userId) ?? []) if (l.deviceId === deviceId) l.send(JSON.stringify({ type: 'logout' }));
  }

  count(): number {
    let n = 0;
    for (const s of this.subs.values()) n += s.size;
    return n;
  }
}
