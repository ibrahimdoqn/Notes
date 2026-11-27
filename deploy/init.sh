#!/usr/bin/env sh
# İlk kurulum: .env dosyasını oluşturur, gizli değerleri rastgele üretir.
# Kullanım: ./init.sh [alan-adı]
set -eu
cd "$(dirname "$0")"

if [ -f .env ]; then
  echo ".env zaten var; üzerine yazılmadı."
  exit 0
fi
command -v openssl >/dev/null || { echo "openssl gerekli."; exit 1; }

domain="${1:-}"
if [ -z "$domain" ]; then
  printf "Alan adı (yerel deneme için: localhost): "
  read -r domain
fi
domain="${domain:-localhost}"

pg_pass="$(openssl rand -base64 33 | tr -d '/+=\n' | cut -c1-40)"
jwt_key="$(openssl genpkey -algorithm ed25519 2>/dev/null | awk 'BEGIN{ORS="\\n"} {print}')"

sed -e "s|^DOMAIN=.*|DOMAIN=${domain}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_pass}|" \
    .env.example > .env
# Anahtarı sed dışında ekle (içindeki karakterler sed ifadesini bozmasın).
grep -v '^JWT_PRIVATE_KEY=' .env > .env.tmp && mv .env.tmp .env
printf 'JWT_PRIVATE_KEY="%s"\n' "$jwt_key" >> .env
chmod 600 .env

mkdir -p backups
# worker imajı "node" (uid 1000) kullanıcısıyla çalışır.
chown 1000:1000 backups 2>/dev/null || chmod 777 backups

echo ".env oluşturuldu (DOMAIN=${domain})."
echo "Sonraki adımlar:"
echo "  docker compose up -d --build"
echo "  Tarayıcıda https://${domain}/yonetim/ adresini aç ve yönetici hesabını oluştur."
echo "  Diğer kullanıcıları da aynı sayfadan açarsın."
