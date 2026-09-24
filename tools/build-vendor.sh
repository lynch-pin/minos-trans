#!/usr/bin/env bash
# vendor/anthropic-sdk.js 를 다시 만든다.
#
# 이 사이트는 서버도 빌드 단계도 없는 정적 사이트라서, 공식 Anthropic
# TypeScript SDK 를 브라우저용 ESM 번들로 미리 말아 레포에 넣어 둔다.
# CDN 에 런타임으로 의존하지 않으므로 GitHub Pages 에 그대로 올라간다.
#
# SDK 버전을 올릴 때만 실행하면 된다:
#   ./tools/build-vendor.sh 0.126.0

set -euo pipefail

VERSION="${1:-0.126.0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ @anthropic-ai/sdk@${VERSION} 를 받는 중…"
cd "$WORK"
npm init -y >/dev/null
npm install --silent "@anthropic-ai/sdk@${VERSION}" esbuild

cat > entry.mjs <<'ENTRY'
export { default as Anthropic } from '@anthropic-ai/sdk';
export * from '@anthropic-ai/sdk';
ENTRY

echo "→ 브라우저용 ESM 으로 번들하는 중…"
./node_modules/.bin/esbuild entry.mjs \
  --bundle --format=esm --platform=browser --target=es2022 --minify \
  --outfile="${ROOT}/vendor/anthropic-sdk.js"

printf '%s\n' "$VERSION" > "${ROOT}/vendor/VERSION"
echo "→ 완료: vendor/anthropic-sdk.js ($(du -h "${ROOT}/vendor/anthropic-sdk.js" | cut -f1))"
