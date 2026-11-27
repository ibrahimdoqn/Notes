#!/usr/bin/env sh
# Elle yedek: çöp kutusu temizliği + pg_dump, deploy/backups/ altına.
set -eu
cd "$(dirname "$0")"
. ./lib.sh
require_compose
$DC exec -T worker node dist/worker.js once
ls -1t backups/*.dump | head -3
