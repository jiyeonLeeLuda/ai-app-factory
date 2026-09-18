import { toFile } from "openai";
import {
  openai,
  OPENAI_MODEL,
  MAX_OUTPUT_TOKENS,
  REASONING_EFFORT,
  STT_MODEL,
  TTS_MODEL,
  TTS_VOICE,
  TTS_INSTRUCTIONS,
} from "../openai";
import { SentenceSplitter } from "../sentence";
import { LeadingEmotionExtractor, type Emotion } from "./emotion";

// 서버 릴레이 파이프라인: STT → LLM(emotion 태그 + 문장 스트리밍) → TTS (w3-spec S4)
// ⚠️ 상대경로 import — tsx가 tsconfig `paths(@/)`를 해석하지 않아도 서버가 뜨도록.

export type Turn = { role: "user" | "assistant"; content: string };

// 통화 스트림 청크: 선두 emotion(딱 한 번) → 문장들 순서대로.
export type CallChunk =
  | { type: "emotion"; value: Emotion }
  | { type: "sentence"; text: string };

// 페르소나(DB systemPrompt) + "전화 통화 중, 짧은 구어체" 맥락 + emotion 태그 규약을 덧댄다 (S2/S4).
// ⚠️ emotion 규약은 통화 instructions 에만 — DB systemPrompt(채팅 공용)엔 넣지 않는다(채팅 답변에 태그 누수 방지).
export function buildCallInstructions(systemPrompt: string): string {
  return `${systemPrompt}

지금은 팬과 '전화 통화' 중이야. 자막 없이 목소리로만 전해져.
- 짧고 자연스러운 구어체로, 한 번에 한두 문장만 말해.
- 긴 설명이나 목록은 피하고, 통화하듯 리듬 있게 끊어 말해.

[감정 표현 규칙]
- 응답 맨 앞에 지금 감정 태그를 하나 붙여. 형식은 [[happy]] 처럼 대괄호 두 개.
- 감정은 happy, angry, sad, relaxed, surprised, neutral 중 하나만 골라.
- 태그는 맨 앞에 딱 한 번만. 그 뒤에 자연스럽게 말해. 태그를 문장 중간에 넣지 마.`;
}

// STT — 발화 단위 파일 전사. WebM/Opus를 그대로 받음(변환 불필요), 파일명 확장자로 포맷 판별. (S4)
export async function transcribe(
  audio: Buffer,
  filename = "utterance.webm",
): Promise<string> {
  const file = await toFile(audio, filename, { type: "audio/webm" });
  const res = await openai.audio.transcriptions.create({
    file,
    model: STT_MODEL,
  });
  return res.text ?? "";
}

// LLM 스트리밍 → 선두 emotion 태그를 즉시 뽑아 방출하고, 나머지를 문장 경계로 잘라 yield (S4).
// 선두 태그만 버퍼링하므로 W2 첫문장 지연트릭이 유지된다. reasoning.effort:minimal 로 벙어리(빈 응답) 방지.
export async function* streamCall(
  instructions: string,
  input: Turn[],
): AsyncGenerator<CallChunk> {
  const stream = await openai.responses.create({
    model: OPENAI_MODEL,
    instructions,
    input,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: REASONING_EFFORT },
    stream: true,
  });

  const extractor = new LeadingEmotionExtractor();
  const splitter = new SentenceSplitter();
  let emotionEmitted = false;

  const emit = function* (part: { emotion?: Emotion; text: string }) {
    if (part.emotion && !emotionEmitted) {
      emotionEmitted = true;
      yield { type: "emotion", value: part.emotion } as CallChunk;
    }
    if (part.text) {
      for (const s of splitter.push(part.text)) {
        yield { type: "sentence", text: s } as CallChunk;
      }
    }
  };

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      yield* emit(extractor.push(event.delta));
    } else if (event.type === "response.completed") {
      break;
    }
  }
  yield* emit(extractor.flush());
  const tail = splitter.flush();
  if (tail) yield { type: "sentence", text: tail };
}

// TTS — 문장 하나를 mp3 Buffer로. (<audio> 재생 호환 최선, S4)
export async function synthesize(text: string): Promise<Buffer> {
  const res = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    instructions: TTS_INSTRUCTIONS, // 딜리버리 조종(밝은 소녀 톤) — gpt-4o-mini-tts 지원
    response_format: "mp3",
  });
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
