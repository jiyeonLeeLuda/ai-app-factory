import { toFile } from "openai";
import {
  openai,
  OPENAI_MODEL,
  MAX_OUTPUT_TOKENS,
  REASONING_EFFORT,
  STT_MODEL,
  TTS_MODEL,
  TTS_VOICE,
} from "../openai";
import { SentenceSplitter } from "../sentence";

// 서버 릴레이 파이프라인: STT → LLM(문장 스트리밍) → TTS (w2-spec S4)
// ⚠️ 상대경로 import — tsx가 tsconfig `paths(@/)`를 해석하지 않아도 서버가 뜨도록.

export type Turn = { role: "user" | "assistant"; content: string };

// 페르소나(DB systemPrompt) + "전화 통화 중, 짧은 구어체" 맥락을 instructions에 덧댄다 (S2/S4).
export function buildCallInstructions(systemPrompt: string): string {
  return `${systemPrompt}

지금은 팬과 '전화 통화' 중이야. 자막 없이 목소리로만 전해져.
- 짧고 자연스러운 구어체로, 한 번에 한두 문장만 말해.
- 긴 설명이나 목록은 피하고, 통화하듯 리듬 있게 끊어 말해.`;
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

// LLM 스트리밍 → 문장 경계가 나오는 즉시 yield (첫 문장을 곧바로 TTS 태우기 위함). (S4)
// reasoning.effort:minimal 을 반드시 실어 추론토큰 소진에 의한 빈 응답(벙어리)을 막는다.
export async function* streamSentences(
  instructions: string,
  input: Turn[],
): AsyncGenerator<string> {
  const stream = await openai.responses.create({
    model: OPENAI_MODEL,
    instructions,
    input,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: REASONING_EFFORT },
    stream: true,
  });

  const splitter = new SentenceSplitter();
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      for (const s of splitter.push(event.delta)) yield s;
    } else if (event.type === "response.completed") {
      break;
    }
  }
  const tail = splitter.flush();
  if (tail) yield tail;
}

// TTS — 문장 하나를 mp3 Buffer로. (<audio> 재생 호환 최선, S4)
export async function synthesize(text: string): Promise<Buffer> {
  const res = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    response_format: "mp3",
  });
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
