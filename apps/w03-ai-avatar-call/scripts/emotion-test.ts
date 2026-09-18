// emotion 파서 단위테스트 (w3-spec S5 [신규]). 순수함수.
// "[[happy]] 안녕"→{happy,"안녕"}, "[[excited]] hi"→neutral 폴백, 태그 없음→neutral+전체 발화,
// 중간 [[x]] stray 제거. + 스트리밍 추출기(LeadingEmotionExtractor) 동작.

import {
  parseLeadingEmotion,
  sanitizeForTTS,
  LeadingEmotionExtractor,
} from "../lib/voice/emotion";

let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("=== emotion 파서 단위테스트 ===");

// 1) 유효 선두 태그 → 감정 + 태그 뗀 텍스트
const a = parseLeadingEmotion("[[happy]] 안녕");
ok(a.emotion === "happy" && a.text === "안녕", `"[[happy]] 안녕" → {happy,"안녕"} (got ${JSON.stringify(a)})`);

// 2) enum 밖 값 → neutral 폴백
const b = parseLeadingEmotion("[[excited]] hi");
ok(b.emotion === "neutral", `"[[excited]] hi" → neutral (got ${b.emotion})`);

// 3) 태그 없음 → neutral + 전체를 발화로
const c = parseLeadingEmotion("안녕하세요 오늘 뭐해");
ok(c.emotion === "neutral" && c.text === "안녕하세요 오늘 뭐해", "태그 없음 → neutral + 전체 발화");

// 4) 중간 stray [[x]] 제거
const d = parseLeadingEmotion("[[sad]] 오늘은 [[x]] 좀 그래");
ok(d.emotion === "sad" && d.text === "오늘은 좀 그래", `중간 stray 제거 (got ${JSON.stringify(d)})`);

// 5) 6개 감정 각각 인식
for (const e of ["happy", "angry", "sad", "relaxed", "surprised", "neutral"]) {
  const r = parseLeadingEmotion(`[[${e}]] 문장`);
  ok(r.emotion === e, `[[${e}]] 인식`);
}

// 6) sanitizeForTTS: 대괄호 태그 전부 제거
ok(sanitizeForTTS("[[happy]] 안녕 [[y]] 잘가") === "안녕 잘가", "sanitize: 모든 [[...]] 제거");

// 7) 스트리밍 추출기 — 델타로 쪼개 들어와도 선두 감정 확정 + 통과 텍스트 누적
{
  const ex = new LeadingEmotionExtractor();
  let emitted = "";
  let passthrough = "";
  for (const delta of ["[[ha", "ppy]] 안", "녕 반가워"]) {
    const r = ex.push(delta);
    if (r.emotion) emitted = r.emotion;
    passthrough += r.text;
  }
  passthrough += ex.flush().text;
  ok(emitted === "happy", `스트리밍 선두 감정 = happy (got ${emitted})`);
  ok(passthrough.trim() === "안녕 반가워", `스트리밍 통과 텍스트 (got ${JSON.stringify(passthrough)})`);
}

// 8) 스트리밍: 태그 없이 시작하면 즉시 neutral 확정, 전체 통과
{
  const ex = new LeadingEmotionExtractor();
  const r = ex.push("안녕 오늘 뭐해?");
  ok(r.emotion === "neutral" && r.text === "안녕 오늘 뭐해?", "스트리밍 태그 없음 → neutral 즉시");
}

if (failed) {
  console.error(`\n❌ FAIL: ${failed}개`);
  process.exit(1);
}
console.log("\n✅ PASS (emotion 파서)");
