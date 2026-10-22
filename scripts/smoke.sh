#!/usr/bin/env bash
# Zero-key smoke: seed locally, curl public surfaces on a running demo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${VIA_PUBLIC_URL:-http://127.0.0.1:8787}"
BASE="${BASE%/}"

echo "== smoke against ${BASE} =="

if ! curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 "${BASE}/health" | grep -q 200; then
  echo "Server not up at ${BASE}."
  echo "In another terminal: npm run demo   (zero keys)"
  echo "Then: npm run smoke"
  node src/cli.js seed
  exit 1
fi

node src/cli.js seed >/dev/null

fail=0
check() {
  local path="$1"
  local out code
  out="$(mktemp)"
  code="$(curl -s -o "$out" -w '%{http_code}' "${BASE}${path}" || echo 000)"
  if [[ "$code" != "200" ]]; then
    echo "FAIL ${path} → HTTP ${code}"
    fail=1
    rm -f "$out"
    return
  fi
  echo "ok   ${path} → 200"
  if [[ "$path" == "/api/board" ]]; then
    if ! grep -q '"model"' "$out"; then
      echo "FAIL /api/board missing model field"
      fail=1
    else
      echo "ok   /api/board has model"
    fi
  fi
  rm -f "$out"
}

check /
check /terms
check /privacy
check /api/board

if [[ "$fail" -ne 0 ]]; then
  echo "smoke failed"
  exit 1
fi
echo "smoke passed"
