#!/usr/bin/env bash
# 동기화 잡 3종을 순서대로 실행한다: manifest → summaries → upload.
# launchd/cron 에서 이 스크립트를 지정 시각에 호출한다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# node/tsx 가 PATH 에 있어야 한다(launchd 는 최소 환경으로 실행되므로 필요 시 절대경로 지정).
npm run manifest
npm run summaries
npm run upload
