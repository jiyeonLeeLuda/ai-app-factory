// 파이프라인 통합 테스트 (w2-spec S5 Q1).
// 마이크·브라우저 없이 서버 음성 파이프라인을 샘플 오디오로 검증한다:
//   ① 샘플 발화를 TTS로 만들어(사람 목소리 대용) STT에 먹인다
//   ② STT 전사 텍스트가 나오는지
//   ③ LLM 응답이 "비어있지 않은지" (reasoning.effort:minimal 검증 — 벙어리 방지)
//   ④ 문장 조각이 1개 이상 생성되는지 (문장 분할 → 문장별 TTS mp3 생성)
// 실행: npx tsx --env-file=.env scripts/pipeline-test.ts
//
// 실제 마이크·음성 자연스러움·지연 체감은 자동화 불가 → 사람 몫(Acceptance).

import {
  transcribe,
  streamSentences,
  synthesize,
  buildCallInstructions,
  type Turn,
} from "../lib/voice/pipeline";
import { prisma } from "../lib/prisma";

const SAMPLE_UTTERANCE = "안녕 필립, 오늘 뭐 하고 지냈어?";

function fail(msg: string): never {
  console.error(`\n❌ FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log("=== W2 파이프라인 통합 테스트 ===\n");

  // 0) 페르소나 로드 (통화 instructions 재료)
  const artist = await prisma.artist.findUnique({ where: { slug: "philip" } });
  if (!artist) fail("시드된 아티스트(philip)를 찾을 수 없음 — prisma db seed 먼저.");
  const instructions = buildCallInstructions(artist!.systemPrompt);

  // 1) 샘플 오디오 생성: TTS로 사람 발화를 대신 만든다 (mp3)
  console.log(`1) 샘플 발화 TTS 생성: "${SAMPLE_UTTERANCE}"`);
  const sampleAudio = await synthesize(SAMPLE_UTTERANCE);
  if (sampleAudio.length < 100) fail(`샘플 TTS 오디오가 비었음 (${sampleAudio.length} bytes)`);
  console.log(`   → mp3 ${sampleAudio.length} bytes OK\n`);

  // 2) STT: 그 오디오를 전사 (mp3 파일명으로 포맷 판별)
  console.log("2) STT 전사");
  const transcript = (await transcribe(sampleAudio, "sample.mp3")).trim();
  console.log(`   → 전사: ${JSON.stringify(transcript)}`);
  if (!transcript) fail("STT 전사 결과가 비었음");
  console.log("   → 전사 비어있지 않음 OK\n");

  // 3) LLM: 응답 스트리밍 → 문장 조각 수집 → 4) 문장마다 TTS
  console.log("3) LLM 응답 스트리밍 + 4) 문장별 TTS");
  const input: Turn[] = [{ role: "user", content: transcript }];
  const sentences: string[] = [];
  let ttsChunks = 0;
  let ttsBytes = 0;
  for await (const sentence of streamSentences(instructions, input)) {
    sentences.push(sentence);
    const audio = await synthesize(sentence);
    ttsChunks += 1;
    ttsBytes += audio.length;
    console.log(`   [문장 ${sentences.length}] ${JSON.stringify(sentence)} → mp3 ${audio.length}B`);
  }

  const full = sentences.join(" ").trim();
  console.log(`\n   → LLM 응답 전체: ${JSON.stringify(full)}`);

  // 검증 (S5 Q1)
  if (!full) fail("LLM 응답이 비어있음 (reasoning.effort:minimal 미적용 의심 — 추론토큰 소진)");
  if (sentences.length < 1) fail("문장 조각이 1개 미만");
  if (ttsChunks < 1 || ttsBytes < 100) fail("문장 TTS mp3가 생성되지 않음");

  console.log("\n✅ PASS");
  console.log(`   - STT 전사 비어있지 않음: "${transcript}"`);
  console.log(`   - LLM 응답 비어있지 않음 (reasoning.effort 검증): ${full.length}자`);
  console.log(`   - 문장 조각 ${sentences.length}개, 문장 TTS mp3 ${ttsChunks}개 (${ttsBytes} bytes)`);
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
