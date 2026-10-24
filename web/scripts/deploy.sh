#!/usr/bin/env bash
# Builds the app and/or the catalog and uploads them to a server over SSH.
#
#   DEPLOY_TARGET=forge@203.0.113.10:/home/forge/beta.example.com/public ./scripts/deploy.sh
#   DRY_RUN=1 DEPLOY_TARGET=... ./scripts/deploy.sh      # list what would change, upload nothing
#   DEPLOY_PARTS=app ./scripts/deploy.sh                 # app | catalog | all (default all)
#   BUILD_MODE=production ./scripts/deploy.sh            # defaults to "beta" (see .env.beta)
#
# The app (a few hundred KB) and the catalog (hundreds of MB, rebuilt only when pedals change) deploy
# independently, because the app doesn't need the catalog to build. Catalog files are content-addressed
# (the name contains a hash of the source image), so a file that already exists on the server is correct
# and is skipped. Upload order matters: hashed images go up before the manifest that points at them, so a
# visitor never sees a manifest referencing files that haven't arrived. Old hashed files are left in place
# (they keep cached pages working); prune them by hand if disk space matters.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEPLOY_TARGET:?Set DEPLOY_TARGET, e.g. forge@203.0.113.10:/home/forge/beta.example.com/public}"
HOST="${DEPLOY_TARGET%%:*}"
DIR="${DEPLOY_TARGET#*:}"
MODE="${BUILD_MODE:-beta}"
PARTS="${DEPLOY_PARTS:-all}"
case "$PARTS" in app | catalog | all) ;; *) echo "DEPLOY_PARTS must be app, catalog or all (got '$PARTS')" >&2; exit 2 ;; esac
want() { [ "$PARTS" = all ] || [ "$PARTS" = "$1" ]; }

RSYNC=(rsync -az --human-readable --stats)
[ -n "${DRY_RUN:-}" ] && RSYNC+=(--dry-run) && echo "DRY RUN: nothing will be uploaded"

if want catalog; then
  echo "==> catalog build (incremental)"
  npm run catalog:build --silent
fi

if want app; then
  echo "==> app build (mode: $MODE)"
  npm run build --silent -- --mode "$MODE"
fi

echo "==> preparing $HOST:$DIR"
[ -n "${DRY_RUN:-}" ] || ssh "$HOST" "mkdir -p '$DIR/catalog/thumb' '$DIR/catalog/img'"

if want app; then
  echo "==> app (index.html + assets); the catalog directory on the server is left alone"
  "${RSYNC[@]}" --delete --exclude 'catalog' dist/ "$DEPLOY_TARGET/"
fi

if want catalog; then
  echo "==> catalog images (skipping files the server already has), then the manifest last"
  "${RSYNC[@]}" --ignore-existing public/catalog/thumb/ "$DEPLOY_TARGET/catalog/thumb/"
  "${RSYNC[@]}" --ignore-existing public/catalog/img/ "$DEPLOY_TARGET/catalog/img/"
  if [ -n "${DRY_RUN:-}" ] && ! ssh "$HOST" "test -d '$DIR/catalog'"; then
    # A dry run doesn't create the remote folder, and rsync can't list a file into a folder that doesn't exist yet.
    echo "(dry run) $DIR/catalog doesn't exist yet; a real run creates it and uploads catalog.json"
  else
    "${RSYNC[@]}" public/catalog/catalog.json "$DEPLOY_TARGET/catalog/catalog.json"
  fi
fi

echo "==> done"
