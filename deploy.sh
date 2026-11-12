#!/usr/bin/env bash
# Deploys the built site (public/) from a laptop: checks that public/ matches a fresh build, copies
# it next to the infrastructure files on the host and from there into the web root, which belongs
# to root (nginx only reads it). SITE_SKIP_VERIFY=1 skips the check.
set -euo pipefail
HOST=${HOST:-tabora}
ROOT=$(cd "$(dirname "$0")" && pwd)
[ -n "${SITE_SKIP_VERIFY:-}" ] || sh "$ROOT/verify.sh"
ssh "$HOST" "install -d -m 700 /root/tabora-infra && mkdir -p /root/tabora-infra/site"
rsync -az --delete "$ROOT/public/" "$HOST:/root/tabora-infra/site/"
ssh "$HOST" 'rsync -a --delete --chown=root:root --chmod=D755,F644 /root/tabora-infra/site/ /var/www/tabora.app/ && echo "site updated"'
