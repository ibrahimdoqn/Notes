#!/usr/bin/env sh
# Cam Notlar sunucu kurulumu: erişim türünü, adresi ve portu sorar, .env dosyasını hazırlar,
# gizli değerleri (veritabanı parolası, oturum anahtarı) rastgele üretir.
#
#   ./init.sh            İlk kurulum. .env varsa yalnızca adres/port ayarlarını değiştirmeyi önerir.
#
# Soru sormadan kurmak için (otomasyon):
#   CAMNOTLAR_MODE=local-https|http|public  CAMNOTLAR_HOST=192.168.1.1  CAMNOTLAR_PORT=8443  ./init.sh
#
# POSIX sh: OpenWrt (busybox ash) üzerinde de çalışır.
set -eu
cd "$(dirname "$0")"
. ./lib.sh
find_compose
DCMD="${DC:-docker compose}"

NONINTERACTIVE=0
[ -n "${CAMNOTLAR_MODE:-}" ] && NONINTERACTIVE=1

# ask "Soru" "varsayılan"  →  $REPLY
ask() {
  if [ "$NONINTERACTIVE" = 1 ]; then
    REPLY="$2"
    return
  fi
  if [ -n "$2" ]; then printf "%s [%s]: " "$1" "$2"; else printf "%s: " "$1"; fi
  read -r REPLY || REPLY=""
  [ -n "$REPLY" ] || REPLY="$2"
}

yes_no() { # yes_no "Soru" e|h  → 0 evet / 1 hayır
  if [ "$NONINTERACTIVE" = 1 ]; then [ "$2" = e ]; return; fi
  if [ "$2" = e ]; then printf "%s [E/h]: " "$1"; else printf "%s [e/H]: " "$1"; fi
  read -r a || a=""
  [ -n "$a" ] || a="$2"
  case "$a" in e|E|evet|y|Y|yes) return 0 ;; *) return 1 ;; esac
}

# .env içinde KEY=VALUE satırını yazar ya da ekler (değer olduğu gibi yazılır).
set_env() {
  K="$1" V="$2" awk '
    BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"] }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' .env > .env.tmp
  mv .env.tmp .env
}

# Yerel ağ IP adresi: OpenWrt'de LAN arayüzü, diğer sistemlerde varsayılan yolun kaynağı.
detect_ip() {
  ip=""
  if command -v uci >/dev/null 2>&1; then
    ip="$(uci -q get network.lan.ipaddr 2>/dev/null | cut -d/ -f1 || true)"
  fi
  if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  echo "${ip:-127.0.0.1}"
}

# Port dinleniyor mu? (ss ya da busybox netstat)
port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"
  else
    return 1
  fi
}

# Rastgele değerler: openssl varsa onunla, yoksa (OpenWrt'de çoğu zaman yok) Docker içindeki Node ile.
gen_secrets() {
  if command -v openssl >/dev/null 2>&1; then
    PG_PASS="$(openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-40)"
    JWT_KEY="$(openssl genpkey -algorithm ed25519 2>/dev/null | awk 'BEGIN{ORS="\\n"} {print}')"
  else
    echo "openssl yok; gizli değerler Docker içinde üretiliyor (node:22-alpine indirilebilir)…"
    out="$(docker run --rm node:22-alpine node -e '
      const c = require("node:crypto");
      const pw = c.randomBytes(30).toString("base64url").slice(0, 40);
      const pem = c.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
      console.log(pw); console.log(pem.trim().split("\n").join("\\n"));')"
    PG_PASS="$(printf "%s\n" "$out" | sed -n 1p)"
    JWT_KEY="$(printf "%s\n" "$out" | sed -n 2p)"
  fi
  [ -n "$PG_PASS" ] && [ -n "$JWT_KEY" ] || { echo "Gizli değerler üretilemedi."; exit 1; }
}

# ---------------------------------------------------------------- başlangıç

FRESH=1
if [ -f .env ]; then
  FRESH=0
  echo "Mevcut kurulum bulundu (.env). Gizli değerler korunur."
  if [ "$NONINTERACTIVE" = 0 ] && ! yes_no "Erişim ayarlarını (tür, adres, port) değiştirmek ister misin?" h; then
    exit 0
  fi
else
  cp .env.example .env
  chmod 600 .env
fi

echo
echo "Cam Notlar'a nasıl erişilecek?"
echo "  1) Yerel ağ, HTTP   (varsayılan) — IP ve portla bağlanılır, sertifika yok: http://192.168.1.1:8080"
echo "                       Not: tarayıcıda 'uygulama olarak yükle' ve sunucu kapalıyken açılış çalışmaz."
echo "  2) Yerel ağ, HTTPS  — Caddy kendi sertifikasını üretir; her cihaza bir kez kök sertifika kurulur."
echo "  3) İnternet         — alan adı ve Let's Encrypt; 443 portu internete açık olmalı."
case "${CAMNOTLAR_MODE:-}" in
  http) choice=1 ;; local-https) choice=2 ;; public) choice=3 ;;
  *) ask "Seçim" "1"; choice="$REPLY" ;;
esac
case "$choice" in
  1) MODE=http; DEF_PORT=8080 ;;
  2) MODE=local-https; DEF_PORT=8443 ;;
  3) MODE=public; DEF_PORT=443 ;;
  *) echo "Geçersiz seçim: $choice"; exit 1 ;;
esac

# Adres
if [ "$MODE" = public ]; then
  ask "Alan adı (ör. notlar.ornek.com)" "${CAMNOTLAR_HOST:-}"
  HOSTS="$REPLY"
  [ -n "$HOSTS" ] || { echo "Alan adı gerekli."; exit 1; }
else
  echo
  echo "Sunucunun yerel ağdaki adresi. Birden çok ad virgülle yazılabilir (ör. 192.168.1.1,notlar.lan)."
  ask "Adres" "${CAMNOTLAR_HOST:-$(detect_ip)}"
  HOSTS="$REPLY"
fi
# Boşlukları ve boş öğeleri at: " ,a, ,b," → "a,b"
HOSTS="$(echo "$HOSTS" | tr -d ' ' | tr -s ',' | sed 's/^,//; s/,$//')"
FIRST_HOST="$(echo "$HOSTS" | cut -d, -f1)"
[ -n "$FIRST_HOST" ] || { echo "Adres gerekli."; exit 1; }

# Port
echo
[ "$MODE" = public ] && echo "Not: Let's Encrypt doğrulaması için internetten 443'e gelen bağlantı bu porta yönlendirilmeli."
while :; do
  ask "Port" "${CAMNOTLAR_PORT:-$DEF_PORT}"
  PORT="$REPLY"
  case "$PORT" in ''|*[!0-9]*) echo "Port bir sayı olmalı."; [ "$NONINTERACTIVE" = 1 ] && exit 1; continue ;; esac
  if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo "Port 1–65535 arasında olmalı."; [ "$NONINTERACTIVE" = 1 ] && exit 1; continue
  fi
  if port_in_use "$PORT" && [ "$PORT" != "$(env_get PORT)" ]; then
    echo "Port $PORT şu an kullanımda (OpenWrt arayüzü LuCI genellikle 80 ve 443'ü kullanır)."
    if [ "$NONINTERACTIVE" = 1 ]; then exit 1; fi
    yes_no "Yine de bu port kullanılsın mı?" h || continue
  fi
  break
done

# Caddy ayarları
SECURE=true
case "$MODE" in
  local-https)
    INNER=443
    SITE=""
    for h in $(echo "$HOSTS" | tr ',' ' '); do SITE="${SITE:+$SITE, }https://$h"; done
    TLS='"tls internal"'
    # IP ile bağlanan istemciler SNI göndermez; varsayılan sertifika ilk adresinki olsun.
    GLOBAL="\"default_sni $FIRST_HOST\\nskip_install_trust\""
    SCHEME=https; DEFAULT_PORT=443
    ;;
  http)
    INNER=80
    SITE='"http://"'
    TLS='""'
    GLOBAL='""'
    SECURE=false
    SCHEME=http; DEFAULT_PORT=80
    ;;
  public)
    INNER=443
    SITE="$(echo "$HOSTS" | sed 's/,/, /g')"
    TLS='""'
    GLOBAL='""'
    SCHEME=https; DEFAULT_PORT=443
    ;;
esac
case "$SITE" in \"*) ;; *) SITE="\"$SITE\"" ;; esac
if [ "$PORT" = "$DEFAULT_PORT" ]; then URL="$SCHEME://$FIRST_HOST"; else URL="$SCHEME://$FIRST_HOST:$PORT"; fi

set_env MODE "$MODE"
set_env PUBLIC_URL "$URL"
set_env PORT "$PORT"
set_env INNER_PORT "$INNER"
set_env SITE_ADDRESS "$SITE"
set_env SITE_TLS "$TLS"
set_env CADDY_GLOBAL "$GLOBAL"
set_env SECURE_COOKIES "$SECURE"

if [ "$FRESH" = 1 ]; then
  gen_secrets
  set_env POSTGRES_PASSWORD "$PG_PASS"
  set_env JWT_PRIVATE_KEY "\"$JWT_KEY\""
fi

mkdir -p backups
# worker imajı "node" (uid 1000) kullanıcısıyla çalışır.
chown 1000:1000 backups 2>/dev/null || chmod 777 backups

echo
echo "Hazır. Adres: $URL"
echo
echo "Sonraki adımlar:"
if [ "$FRESH" = 1 ]; then
  echo "  1) $DCMD up -d --build      (ilk derleme NanoPi R4S'te 10–20 dk sürebilir)"
else
  echo "  1) $DCMD up -d              (yalnızca Caddy yeniden başlar)"
fi
if [ "$MODE" = local-https ]; then
  echo "  2) ./sertifika.sh            (kök sertifikayı dışa aktarır; telefona ve bilgisayarlara bir kez kurulur)"
  echo "  3) Tarayıcıda $URL/yonetim/ adresini aç, yönetici hesabını oluştur."
else
  echo "  2) Tarayıcıda $URL/yonetim/ adresini aç, yönetici hesabını oluştur."
fi
echo "     Android uygulamasında sunucu olarak $URL yaz."
