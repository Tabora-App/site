#!/bin/sh
# Builds the site: scripts and pages.
# Scripts: src/ -> public/assets/js/ (hashed names: nginx serves /assets/ as immutable) and
# public/site.js, the entry point in the root: one line importing the built main-HASH.js.
# Pages: the Russian template pages/index.html and the dictionaries i18n/*.json ->
# public/<lang>/index.html and public/index.html (see pages.mjs). public/ holds only built
# output; the text of the page is edited in the template.
# Package versions are pinned in package-lock.json; package install scripts are not run.
# Arguments: scripts directory (default public/assets/js), entry point file (public/site.js)
# and pages directory (public).
# SITE_SKIP_INSTALL=1 skips npm ci (quick rebuilds with packages already installed).
# SITE_I18N is the dictionaries directory (default i18n), SITE_FILES is the site directory that
# local links of the pages are checked against (default: the pages directory).
set -eu
cd "$(dirname "$0")"
out="${1:-public/assets/js}"
entry="${2:-public/site.js}"
pages="${3:-public}"
[ -n "${SITE_SKIP_INSTALL:-}" ] || npm ci --ignore-scripts --no-audit --no-fund --silent
rm -rf "$out"
./node_modules/.bin/esbuild src/main.js --bundle --splitting --format=esm --platform=browser --target=es2022 \
  --minify --legal-comments=eof '--entry-names=[name]-[hash]' '--chunk-names=chunk-[hash]' \
  --outdir="$out" --log-level=warning
main="$(cd "$out" && ls main-*.js)"
[ "$(printf '%s\n' "$main" | wc -l | tr -d ' ')" = 1 ] || { echo "expected a single main-*.js, found: $main" >&2; exit 1; }
printf 'import "./assets/js/%s";\n' "$main" > "$entry"
node pages.mjs "$pages" --i18n "${SITE_I18N:-i18n}" --files "${SITE_FILES:-$pages}"
