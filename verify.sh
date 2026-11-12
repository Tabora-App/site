#!/bin/sh
# Reproducibility check: rebuilds the site in a clean directory and compares it byte for byte with
# the committed public/assets/js, public/site.js and pages public/index.html, public/<lang>/index.html.
# The rebuild also checks the pages themselves: every phrase is translated, the markup is the same
# in all languages, local links resolve (see pages.mjs).
set -eu
root="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R "$root/package.json" "$root/package-lock.json" "$root/build.sh" "$root/pages.mjs" "$root/src" "$root/pages" "$tmp/"
SITE_I18N="$root/i18n" SITE_FILES="$root/public" sh "$tmp/build.sh" "$tmp/js" "$tmp/site.js" "$tmp/out"
ok=1
diff -r "$tmp/js" "$root/public/assets/js" >/dev/null || { ok=0; diff -rq "$tmp/js" "$root/public/assets/js" >&2 || true; }
diff "$tmp/site.js" "$root/public/site.js" >/dev/null || { ok=0; echo "public/site.js differs" >&2; }
for page in $(cd "$tmp/out" && find . -name '*.html' | sed 's|^\./||' | sort); do
  diff "$tmp/out/$page" "$root/public/$page" >/dev/null 2>&1 || { ok=0; echo "public/$page differs from the page built from the template" >&2; }
done
# public/ must not contain pages the build does not produce (hand-edited or from a removed language)
for page in $(cd "$root/public" && find . -name '*.html' | sed 's|^\./||' | sort); do
  [ -f "$tmp/out/$page" ] || { ok=0; echo "public/$page: the build does not produce this page" >&2; }
done
if [ "$ok" = 1 ]; then
  echo "✓ public/assets/js, public/site.js and the pages are reproducible"
else
  echo "✗ the site differs from a fresh build: run ./build.sh" >&2
  exit 1
fi
