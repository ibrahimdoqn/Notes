#!/usr/bin/env sh
# Yerel HTTPS kurulumunda Caddy'nin kök sertifikasını dışa aktarır: camnotlar-kok-sertifika.crt
# Bu dosya her cihaza bir kez "güvenilir kök sertifika" olarak kurulur; sonra tarayıcı ve
# Android uygulaması uyarısız bağlanır. Sertifika caddy_data biriminde saklanır, 10 yıl geçerlidir.
set -eu
cd "$(dirname "$0")"
. ./lib.sh
require_compose

if [ "$(env_get MODE)" != local-https ]; then
  echo "Bu kurulum yerel HTTPS modunda değil (MODE=$(env_get MODE)); kök sertifika gerekmez."
  exit 0
fi
id="$($DC ps -q caddy)"
[ -n "$id" ] || { echo "Caddy çalışmıyor. Önce: $DC up -d"; exit 1; }

src=/data/caddy/pki/authorities/local/root.crt
out=camnotlar-kok-sertifika.crt
# Caddy kök sertifikayı ilk açılışta üretir; birkaç saniye bekle.
i=0
until docker cp "$id:$src" "$out" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -lt 15 ] || { echo "Kök sertifika bulunamadı ($src). Caddy günlüğü: $DC logs caddy"; exit 1; }
  sleep 2
done
chmod 644 "$out"

echo "Kök sertifika: $(pwd)/$out"
if command -v openssl >/dev/null 2>&1; then
  echo "SHA-256 parmak izi: $(openssl x509 -in "$out" -noout -fingerprint -sha256 | cut -d= -f2)"
fi
cat <<'EOF'

Kurulum (her cihazda bir kez):
  Android  : Dosyayı telefona at → Ayarlar → Güvenlik → Şifreleme ve kimlik bilgileri →
             Sertifika yükle → CA sertifikası. (Menü adları markaya göre biraz değişir.)
  Windows  : Dosyaya çift tıkla → Sertifika yükle → Yerel Makine →
             "Güvenilen Kök Sertifika Yetkilileri" deposuna koy.
  macOS    : Anahtar Zinciri Erişimi'nde Sistem'e sürükle → sertifikayı aç → Güven: Her zaman güven.
  Linux    : sudo cp camnotlar-kok-sertifika.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
             (Firefox: Ayarlar → Gizlilik ve Güvenlik → Sertifikaları göster → İçe aktar)
  iPhone   : Dosyayı aç → Ayarlar'da profili yükle → Genel → Hakkında → Sertifika Güven Ayarları → aç.

Bilgisayardan dosyayı almak için (ör. NanoPi'den):
  scp root@<nanopi-adresi>:<bu-klasör>/camnotlar-kok-sertifika.crt .
EOF
