// emotion → expression 매핑 단위테스트 (w3-spec S5 [신규]).
// 6개 emotion → 기대 VRM 표정 키. 무효 → neutral.

import {
  emotionToExpression,
  EMOTION_EXPRESSION_KEYS,
  ALL_EMOTIONS,
} from "../lib/render/expression";

let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("=== emotion→expression 매핑 단위테스트 ===");

// 1) 6개 emotion → 동일 표정 키(1:1)
for (const e of ALL_EMOTIONS) {
  ok(emotionToExpression(e) === e, `${e} → ${e}`);
}

// 2) 무효 값 → neutral
ok(emotionToExpression("excited") === "neutral", "무효(excited) → neutral");
ok(emotionToExpression("") === "neutral", "빈 문자열 → neutral");
ok(emotionToExpression("HAPPY") === "neutral", "대문자(HAPPY, 미정규화) → neutral");

// 3) lerp 대상 표정 키는 neutral 제외 5종(=neutral은 "아무 표정도 아님", 가중치 0)
const keys = EMOTION_EXPRESSION_KEYS as string[];
ok(keys.length === 5, `표정 lerp 키 5종: ${keys.join(",")}`);
ok(keys.includes("happy"), "happy는 lerp 키에 포함");
ok(!keys.includes("neutral"), "neutral은 lerp 키에서 제외");

if (failed) {
  console.error(`\n❌ FAIL: ${failed}개`);
  process.exit(1);
}
console.log("\n✅ PASS (expression 매핑)");
