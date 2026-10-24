#!/usr/bin/env bash
# Builds the app and uploads it, plus the generated catalog, to a server over SSH.
#
#   DEPLOY_TARGET=forge@203.0.113.10:/home/forge/beta.example.com/public ./scripts/deploy.sh
#   DRY_RUN=1 DEPLOY_TARGET=... ./scripts/deploy.sh      # list what would change, upload nothing
#   BUILD_MODE=production ./scripts/deploy.sh            # defaults to "beta" (see .env.beta)
#
# Upload order matters: hashed catalog images go up before the manifest that points at them, so a
# visitor never sees a manifest referencing files that haven't arrived. Old hashed files are left in
# place (they're harmless and keep cached pages working); prune them by hand if disk space matters.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEPLOY_TARGET:?Set DEPLOY_TARGET, e.g. forge@203.0.113.10:/home/forge/beta.example.com/public}"
HOST="${DEPLOY_TARGET%%:*}"
DIR="${DEPLOY_TARGET#*:}"
MODE="${BUILD_MODE:-beta}"
RSYNC=(rsync -az --human-readable --stats)
[ -n "${DRY_RUN:-}" ] && RSYNC+=(--dry-run) && echo "DRY RUN: nothing will be uploaded"

echo "==> catalog build (incremental)"
npm run catalog:build --silent

echo "==> app build (mode: $MODE)"
npm run build --silent -- --mode "$MODE"

echo "==> preparing $HOST:$DIR"
[ -n "${DRY_RUN:-}" ] || ssh "$HOST" "mkdir -p '$DIR/catalog/thumb' '$DIR/catalog/img'"

echo "==> app (index.html + assets); the catalog directory on the server is left alone"
"${RSYNC[@]}" --delete --exclude 'catalog' dist/ "$DEPLOY_TARGET/"

echo "==> catalog images, then the manifest last"
"${RSYNC[@]}" public/catalog/thumb/ "$DEPLOY_TARGET/catalog/thumb/"
"${RSYNC[@]}" public/catalog/img/ "$DEPLOY_TARGET/catalog/img/"
"${RSYNC[@]}" public/catalog/catalog.json "$DEPLOY_TARGET/catalog/catalog.json"

echo "==> done"
