#!/usr/bin/env sh
# Yedekten geri yükleme. Kullanım: ./restore.sh 2026-11-27   (ya da tam dosya yolu)
set -eu
cd "$(dirname "$0")"
. ./lib.sh
require_compose
arg="${1:?Kullanım: ./restore.sh <tarih|dosya>}"
if [ -f "$arg" ]; then file="$arg"; else file="$(ls -1 backups/camnotlar-"$arg"*.dump 2>/dev/null | head -1)"; fi
[ -n "${file:-}" ] && [ -f "$file" ] || { echo "Yedek bulunamadı: $arg"; exit 1; }

echo "Geri yüklenecek: $file"
echo "Mevcut veritabanının yerini alacak. Devam etmek için 'evet' yaz:"
read -r ok
[ "$ok" = "evet" ] || { echo "Vazgeçildi."; exit 1; }

$DC stop api worker
$DC exec -T db pg_restore --clean --if-exists --no-owner -U camnotlar -d camnotlar < "$file"
$DC start api worker
# Ek dosyaları: yedekteki kopyalar eksik olanların yerine konur (mevcutlar korunur).
if [ -d backups/attachments ]; then
  $DC exec -T worker sh -c 'cp -Rn /backups/attachments/. /data/attachments/ 2>/dev/null || true'
fi
echo "Geri yükleme tamam."
