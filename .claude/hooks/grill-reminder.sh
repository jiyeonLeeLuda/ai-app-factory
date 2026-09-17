#!/bin/bash
# 스펙 논의 감지 → /grill-me(grilling) 게이트 리마인더
# 이 레포는 SPEC 작성/개정 시 grilling으로 사고를 압박 검증하기로 결정(2026-09-17).
# UserPromptSubmit 훅: 프롬프트에 스펙 키워드가 있으면 grilling 실행 여부를 물으라고 주입.

input=$(cat)

# jq 있으면 정확 파싱, 없으면 원문 전체로 폴백
if command -v jq >/dev/null 2>&1; then
  prompt=$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null)
else
  prompt="$input"
fi

if printf '%s' "$prompt" | grep -qiE '스펙|spec|격차|pre-?spec|prespec|SPEC_TEMPLATE'; then
  echo "[스펙 논의 감지] 이 레포 규칙: SPEC 작성·개정은 /grill-me(grilling) 게이트를 거친다. 아직 이 스펙에 grilling을 돌리지 않았다면, 사용자에게 '지금 grilling으로 압박 검증할까?'라고 먼저 물어라. (이미 돌렸거나 사용자가 방금 거부했으면 생략)"
fi
exit 0
