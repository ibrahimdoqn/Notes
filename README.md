# Cam Notlar

Apple Notes tarzı, buzlu cam (glass) arayüzlü bir not uygulaması: Docker ile kendi sunucunda çalışan bir eşitleme sunucusu, çevrimdışı çalışan bir web uygulaması (PWA) ve yerel bir Android uygulaması.

![Mimari](docs/img/mimari.png)

## Depo içeriği

| Yol | İçerik |
| --- | --- |
| [`packages/shared`](packages/shared) | Ortak tipler, HTML sözleşmesi (temizleyici), UUIDv7, ayar doğrulama, test örnekleri |
| [`apps/api`](apps/api) | Fastify + PostgreSQL sunucu, eşitleme, kimlik doğrulama, worker (temizlik + yedek) |
| [`apps/web`](apps/web) | Vite + TypeScript PWA (prototipten taşındı), IndexedDB + eşitleme motoru |
| [`apps/android`](apps/android) | Kotlin + Jetpack Compose, Room, WorkManager |
| [`deploy`](deploy) | `docker-compose.yml`, `Caddyfile`, `init.sh`, `backup.sh`, `restore.sh` |
| [`prototype/index.html`](prototype/index.html) | İlk tek dosyalık arayüz prototipi (referans) |
| [`docs/PLAN.md`](docs/PLAN.md) | Geliştirme planı; [`docs/UYGULAMA.md`](docs/UYGULAMA.md) uygulanan kararlar ve durum |

Kural: hiçbir kaynak dosya 1000 satırı geçmez (`npm run lint:lines`, CI'da denetlenir).

## Sunucuyu kurmak (Docker)

Gerekenler: Docker + Compose, alan adının A kaydı sunucuyu göstermeli.

```bash
git clone <bu depo> camnotlar && cd camnotlar/deploy
```

```bash
./init.sh notlar.ornek.com
```

```bash
docker compose up -d --build
```

Sonra tarayıcıda `https://notlar.ornek.com/yonetim/` adresini aç: sunucu boşken bu sayfa **ilk yönetici hesabını** oluşturur. Uygulamalarda kayıt yoktur; tüm kullanıcılar bu yönetim sayfasından **kullanıcı adı ve parola** ile açılır. Aynı sayfadan parola sıfırlanır, yönetici yetkisi verilir ya da kullanıcı silinir. Web uygulaması `https://notlar.ornek.com` adresindedir; Android'de giriş ekranına sunucu adresi, kullanıcı adı ve parola yazılır.

Yönetim sayfasına ulaşılamazsa komut satırından da yapılabilir:

```bash
docker compose exec api node dist/cli/admin.js reset-password yonetici
```

- **Ekler:** dosyalar `attachments` Docker biriminde durur; dosya başına sınır `MAX_ATTACHMENT_MB` (varsayılan 25). Hiçbir notta kullanılmayan ekler bir gün sonra silinir.
- **Yedekleme:** worker her gece 03:00'te `deploy/backups/` altına `pg_dump` alır (7 günlük + 4 haftalık) ve ek dosyalarını `deploy/backups/attachments/` altına aynalar. Elle yedek: `./backup.sh`. Geri yükleme: `./restore.sh 2026-11-27`.
- **Güncelleme:** `git pull && docker compose up -d --build` (ya da `.env` içinde `IMAGE_PREFIX`/`VERSION` ile hazır imajlar: `docker compose pull && docker compose up -d`).
- **Alan adı yoksa:** Tailscale ya da Cloudflare Tunnel ile HTTPS'i dışarıda sonlandırıp `DOMAIN=:80` kullan.

## Geliştirme

```bash
npm install
```

API (yerel PostgreSQL gerekir; `DATABASE_URL` ile adres verilir):

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/camnotlar ATTACHMENTS_DIR=./data/attachments SECURE_COOKIES=false npm run dev -w @camnotlar/api
```

Web (Vite, `/v1` isteklerini `localhost:3000`'e aktarır):

```bash
npm run dev -w @camnotlar/web
```

Testler:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
```

```bash
npm run build && cd apps/web && npx playwright test
```

Android (JDK 17+, Android SDK 35):

```bash
cd apps/android && ./gradlew :app:testDebugUnitTest :app:assembleDebug
```

## Özellikler

- **Eşitleme:** her istemci önce yerel veritabanına yazar (web: IndexedDB, Android: Room), değişiklik kuyruğunu sunucuya iter, sonra son `seq`'ten sonrasını çeker. Çakışmada son yazan kazanır, üstüne yazılan sürüm "… (çakışma kopyası — Cihaz)" olarak saklanır; veri kaybolmaz. WebSocket sinyaliyle diğer cihazlar birkaç saniyede güncellenir.
- **Hesaplar:** kullanıcı adı + parola; kayıtlar yalnızca sunucunun `/yonetim/` sayfasından (ilk kurulum, kullanıcı oluşturma, parola sıfırlama, yetki, silme).
- **Dosya ekleri:** resimler notun içinde görünür, diğer dosyalar dokununca açılır/iner. Web'de düğme, yapıştırma ve sürükle-bırak; Android'de dosya seçici ve paylaş menüsü. Çevrimdışı eklenen dosya cihazda bekler, bağlantı gelince yüklenir.
- **Web:** prototipteki görünüm birebir; giriş, sunucusuz kullanım (sonradan hesaba taşınır), eşitleme göstergesi, cihazlar, not geçmişi (farklarla), Service Worker ile çevrimdışı açılış.
- **Android:** web'in mobil akışıyla aynı ekranlar, tablette üç bölme, web ile aynı HTML'i üreten editör, paylaş menüsü, kısayollar, ana ekran widget'ı, biyometrik kilit, 15 dakikada bir arka plan eşitlemesi.
- **Güvenlik:** Argon2id parolalar, 15 dk'lık EdDSA JWT + döndürülen yenileme belirteci (tekrar kullanımda oturum iptali), web'de HttpOnly çerez, Android'de Keystore şifreleme, sunucuda HTML izin listesi, sıkı CSP, giriş oran sınırı, HIBP parola kontrolü.
