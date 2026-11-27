# Uygulama durumu ve verilen kararlar

27 Kasım 2026 — [PLAN.md](PLAN.md)'nin 1–5. adımları uygulandı. Bu belge planla farkları ve açık kalan işleri listeler.

## Yapılanlar

| Plan adımı | Durum | Doğrulama |
| --- | --- | --- |
| 1. Hazırlık: monorepo, CI, ortak HTML sözleşmesi, fixture'lar | Tamam | `packages/shared` birim testleri, `.github/workflows/ci.yml` |
| 2. Sunucu çekirdeği + Docker | Tamam | 25 API testi gerçek PostgreSQL'e karşı (kimlik, push/pull, çakışma, yetki, geçmiş, arama, WebSocket) + 3 tohumlu eşitleme simülatörü; `docker compose up -d` ile kurulum, yedek alma ve geri yükleme elle denendi |
| 3. Web PWA | Tamam | 8 Playwright testi: not akışı, kontrol listesi, iki sekme canlı eşitleme, çevrimdışı yazma, klasör + ayar eşitleme, sunucusuz → hesap, not geçmişi, mobil gezinme |
| 4. Android | Tamam (cihazda elle deneme bekliyor) | JVM birim testleri (ortak fixture'larla HTML, ayarlar, UUIDv7), debug APK derleniyor |
| 5. Not geçmişi, yedekleme, izleme | Kısmen | Geçmiş ve geri yükleme iki istemcide var; yedek/geri yükleme betikleri var. **Dosya ekleri ve Prometheus/Grafana yok** (aşağıda) |

## Açık kararlar için seçilen varsayılanlar

Plandaki "Karar verilmesi gerekenler" listesi için şu varsayılanlarla ilerlendi; hepsi sonradan değiştirilebilir.

- **Tek kullanıcı / aile ölçeği:** plandaki öneriye uygun olarak Redis ve MinIO çıkarıldı; kurulum 4 servis (caddy, api, worker, db). Kayıt varsayılan kapalı, davet koduyla açılır. WebSocket yayını bellek içi (`apps/api/src/lib/hub.ts`); birden çok api kopyası gerekirse bu tek sınıf Redis pub/sub ile değiştirilir. Oran sınırı da bellek içi.
- **Android yerel (Kotlin/Compose):** widget, paylaş menüsü ve kısayollar bu yüzden mümkün oldu.
- **Uygulama adı / paket:** "Cam Notlar", `com.camnotlar.app`.
- **Dağıtım:** imzalı APK GitHub Releases'e (CI etikette üretir); Play yayını yok.
- **Sunucu yeri:** her ikisi desteklenir; imajlar amd64 + arm64 (Raspberry Pi).

## Planla bilinçli farklar

- **Android editörü WebView:** planda `compose-rich-editor` örnek verilmişti. Bu kütüphane kontrol listesini desteklemiyor ve HTML dönüşümünde biçim kaybı planın en büyük riskiydi. Editör bunun yerine web ile aynı HTML'i üreten küçük bir WebView sayfası (`app/src/main/assets/editor`) olarak yazıldı; araç çubuğu, gezinme ve diğer her şey yerel Compose. Dönüşüm kayıpsız olduğu için ortak fixture testleri Android tarafında başlık/önizleme çıkarımını doğrular.
- **ORM yok:** Drizzle yerine `pg` + düz SQL göç dosyaları (`apps/api/src/db/migrations`). Şema küçük, sorgular okunabilir.
- **HTML temizleme ortak paket içinde:** `sanitize-html` yerine `packages/shared/src/html.ts`; aynı kurallar sunucuda ve web'de (yapıştırma, yedekten geri yükleme) çalışır.
- **Hilt yerine elle bağımlılık kapsayıcısı** (`AppContainer.kt`), **Retrofit yerine OkHttp + kotlinx.serialization**, tek `:app` modülü (paketlere ayrılmış). Proje küçükken derleme süresini ve karmaşıklığı düşürür.
- **Web editör komutları:** `execCommand` hâlâ kullanılıyor ama tek bir modülde (`apps/web/src/editor/commands.ts`) toplandı; tarayıcı desteği kalkarsa yalnızca bu dosya değişir.
- **Google Fonts kaldırıldı:** sıkı CSP ve gizlilik için sistem yazı tipi yığını kullanılıyor.

## Eksikler / sonraki adımlar

- Dosya ekleri (resim/PDF): veri modeli ve uçlar yok. Tek kullanıcı kurulumunda yerel disk birimiyle eklenmesi önerilir.
- `/metrics` (Prometheus) ve `docker-compose.monitoring.yml`; GlitchTip.
- Android: QR ile giriş, hızlı ayarlar kutucuğu, FCM sessiz itme (şimdilik WebSocket ön planda + WorkManager arka planda), SQLCipher seçeneği, Roborazzi ekran görüntüsü testleri.
- Web: 5.000 not için sanal liste ve MiniSearch (şimdilik düz filtreleme; birkaç bin notta sorun yok).
- 2FA, kilitli notlar, uçtan uca şifreleme, gerçek zamanlı ortak düzenleme (plandaki sonraki sürümler).
- Android uygulaması bu ortamda emülatörde çalıştırılamadı; derleme ve birim testleri geçiyor, gerçek cihazda deneme senin adımın (plan adım 6).
