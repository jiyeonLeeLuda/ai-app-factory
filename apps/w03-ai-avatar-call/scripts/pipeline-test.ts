// 파이프라인 통합테스트 (w3-spec S5, 개입 0). 마이크·브라우저 없이 서버 음성+emotion 파이프라인을 검증:
//   ① 샘플 발화를 TTS로 만들어(사람 목소리 대용) STT에 먹인다
//   ② STT 전사 텍스트가 비어있지 않은지
//   ③ LLM 응답 선두 emotion 태그 파싱 성공(emotion∈enum) — 격차 ② 프로토콜 확인
//   ④ 태그 뗀 텍스트가 문장 분할(≥1) 되는지
//   ⑤ 각 문장 sanitize→TTS mp3 바이트가 반환되는지
// 실행: npm run test:pipeline (tsx --env-file=.env)
//
// 실제 입 움직임·표정 변화·음성 자연스러움·렌더 rAF는 자동화 불가(headless서 rAF 정지) → 사람 Acceptance.

import {
  transcribe,
  streamCall,
  synthesize,
  buildCallInstructions,
  type Turn,
} from "../lib/voice/pipeline";
import { EMOTIONS, sanitizeForTTS, type Emotion } from "../lib/voice/emotion";
import { prisma } from "../lib/prisma";

const SAMPLE_UTTERANCE = "안녕 루다, 오늘 기분 어때?";

function fail(msg: string): never {
  console.error(`\n❌ FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log("=== W3 파이프라인 통합테스트 (STT→LLM+emotion→TTS) ===\n");

  // 0) 페르소나 로드 (통화 instructions 재료 = systemPrompt + 통화맥락 + emotion 규약)
  const artist = await prisma.artist.findUnique({ where: { slug: "luda" } });
  if (!artist) fail("시드된 아티스트(luda)를 찾을 수 없음 — prisma db seed 먼저.");
  const instructions = buildCallInstructions(artist!.systemPrompt);

  // 1) 샘플 오디오 생성: TTS로 사람 발화를 대신 만든다 (mp3)
  console.log(`1) 샘플 발화 TTS 생성: "${SAMPLE_UTTERANCE}"`);
  const sampleAudio = await synthesize(SAMPLE_UTTERANCE);
  if (sampleAudio.length < 100) fail(`샘플 TTS 오디오가 비었음 (${sampleAudio.length} bytes)`);
  console.log(`   → mp3 ${sampleAudio.length} bytes OK\n`);

  // 2) STT
  console.log("2) STT 전사");
  const transcript = (await transcribe(sampleAudio, "sample.mp3")).trim();
  console.log(`   → 전사: ${JSON.stringify(transcript)}`);
  if (!transcript) fail("STT 전사 결과가 비었음");
  console.log("   → 전사 비어있지 않음 OK\n");

  // 3) LLM 스트리밍: 선두 emotion + 문장 → 4) 문장마다 sanitize→TTS
  console.log("3) LLM 스트리밍(선두 emotion + 문장) + 4) 문장별 TTS");
  const input: Turn[] = [{ role: "user", content: transcript }];
  const sentences: string[] = [];
  let emotion: Emotion | null = null;
  let ttsChunks = 0;
  let ttsBytes = 0;
  for await (const chunk of streamCall(instructions, input)) {
    if (chunk.type === "emotion") {
      emotion = chunk.value;
      console.log(`   [emotion] ${emotion}`);
      continue;
    }
    const clean = sanitizeForTTS(chunk.text);
    if (!clean) continue;
    sentences.push(clean);
    const audio = await synthesize(clean);
    ttsChunks += 1;
    ttsBytes += audio.length;
    console.log(`   [문장 ${sentences.length}] ${JSON.stringify(clean)} → mp3 ${audio.length}B`);
  }

  const full = sentences.join(" ").trim();
  console.log(`\n   → LLM 응답 전체: ${JSON.stringify(full)}`);

  // 검증 (S5)
  if (emotion === null) fail("emotion 청크가 방출되지 않음(선두 태그 파싱 실패)");
  if (!(EMOTIONS as readonly string[]).includes(emotion)) {
    fail(`emotion이 enum 밖: ${emotion}`);
  }
  if (!full) fail("LLM 응답이 비어있음 (reasoning.effort:minimal 미적용 의심 — 추론토큰 소진)");
  if (sentences.length < 1) fail("문장 조각이 1개 미만");
  if (ttsChunks < 1 || ttsBytes < 100) fail("문장 TTS mp3가 생성되지 않음");
  // sanitize 확인: 최종 문장에 대괄호 태그가 남지 않아야 TTS가 깨끗
  if (full.includes("[[")) fail("발화 텍스트에 [[...]] 태그가 남음(sanitize 실패)");

  console.log("\n✅ PASS");
  console.log(`   - STT 전사 비어있지 않음: "${transcript}"`);
  console.log(`   - emotion 파싱 성공(enum): ${emotion}`);
  console.log(`   - LLM 응답 비어있지 않음(reasoning.effort 검증): ${full.length}자`);
  console.log(`   - 문장 ${sentences.length}개, 문장 TTS mp3 ${ttsChunks}개 (${ttsBytes} bytes)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    await prisma.$disconnect();
    fail(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  });
