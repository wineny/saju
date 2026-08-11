#!/usr/bin/env bash
# saju 설치 — ~/.claude/skills/saju 로 복사한다.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/saju"

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js 가 필요합니다. https://nodejs.org 에서 설치한 뒤 다시 실행하세요." >&2
  exit 1
fi

if [ -d "$DST" ]; then
  echo "· 기존 설치를 덮어씁니다: $DST"
  rm -rf "$DST"
fi

mkdir -p "$DST"
cp -R "$SRC/bin" "$SRC/lib" "$SRC/vendor" "$SRC/references" "$SRC/SKILL.md" "$DST/"
chmod +x "$DST/bin/saju.cjs"

# 설치가 실제로 되는지 확인한다 — 복사만 하고 끝내면 깨진 설치를 성공으로 보고하게 된다.
if ! OUT="$(node "$DST/bin/saju.cjs" chart --born 2000-01-01T12:00 2>&1)"; then
  echo "✗ 설치는 됐지만 실행에 실패했습니다:" >&2
  echo "$OUT" >&2
  exit 1
fi

cat <<EOF

✓ 설치 완료 — $DST

  Claude Code / Codex 에서:
    "내 사주 봐줘"  /  "궁합 봐줘"  /  "택일 해줘"

  CLI 로 바로:
    node $DST/bin/saju.cjs chart  --born 1988-03-15T07:30
    node $DST/bin/saju.cjs match  --a 1988-03-15T07:30 --b 1986-11-02
    node $DST/bin/saju.cjs taegil --from 2027-02-01 --to 2027-02-26

EOF
