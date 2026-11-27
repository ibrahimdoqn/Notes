# Betiklerin ortak yardımcıları (init.sh, backup.sh, restore.sh, sertifika.sh).
# POSIX sh: OpenWrt'nin busybox ash kabuğunda da çalışır.

# Docker Compose komutu: "docker compose" (eklenti) ya da "docker-compose" (OpenWrt paketi).
find_compose() {
  if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
  else
    DC=""
  fi
}

require_compose() {
  find_compose
  if [ -z "$DC" ]; then
    echo "Docker Compose bulunamadı. OpenWrt'de: opkg update && opkg install docker-compose"
    exit 1
  fi
}

# .env içindeki bir değeri okur (tırnaklar atılır).
env_get() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n 1 | sed 's/^"\(.*\)"$/\1/'
}
