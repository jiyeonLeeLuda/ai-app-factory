// emotion 구분자 프로토콜 (w3-spec S4 ★). strict JSON 폐기 — 순수 instruction-following.
// LLM 응답 맨 앞의 `[[emotion]]` 태그를 떼어 감정을 얻고, 나머지를 발화 텍스트로 흘린다.
// 스트리밍 첫문장 지연트릭(W2)을 깨지 않도록, 선두 태그만 버퍼링하고 이후는 그대로 통과시킨다.

export const EMOTIONS = [
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "neutral",
] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const DEFAULT_EMOTION: Emotion = "neutral";

// 선두 태그: 맨 앞(선행 공백 허용)의 [[word]] 하나. (S4 "태그는 맨 앞 한 번만")
const LEADING_TAG_RE = /^\s*\[\[\s*([a-zA-Z]+)\s*\]\]/;
// 문장 어디든 남은 [[...]] 제거용 (TTS가 대괄호를 읽지 않게, S3 G1 sanitize)
const STRAY_TAG_RE = /\[\[[^\]]*\]\]/g;

export function isEmotion(v: string): v is Emotion {
  return (EMOTIONS as readonly string[]).includes(v);
}

// 문장 → TTS 직전 안전장치: 남은 [[...]] 제거 + 공백 정리 (S3 발화 중간 stray 태그).
export function sanitizeForTTS(text: string): string {
  return text.replace(STRAY_TAG_RE, "").replace(/\s+/g, " ").trim();
}

// 완성된 응답 문자열에서 선두 emotion을 파싱 (순수함수 — S5 단위테스트 대상).
// - 선두 유효 태그 → 그 emotion + 태그 뗀 나머지(sanitize)
// - 무효 값/누락 → neutral + 전체를 발화로 처리(무효·중간 태그는 sanitize가 제거)
export function parseLeadingEmotion(raw: string): {
  emotion: Emotion;
  text: string;
} {
  const m = raw.match(LEADING_TAG_RE);
  if (m) {
    const val = m[1].toLowerCase();
    if (isEmotion(val)) {
      return { emotion: val, text: sanitizeForTTS(raw.slice(m[0].length)) };
    }
    return { emotion: DEFAULT_EMOTION, text: sanitizeForTTS(raw) };
  }
  return { emotion: DEFAULT_EMOTION, text: sanitizeForTTS(raw) };
}

// 스트리밍용 선두 태그 추출기. 태그가 닫힐 때까지(또는 태그가 아님이 확정될 때까지)만 버퍼.
// push()는 델타를 받아 { emotion?, text } 를 돌려준다:
//   emotion — 감정이 확정된 그 순간 딱 한 번 실린다.
//   text — 문장 분할기로 그대로 흘려보낼 통과 텍스트(선두 태그는 제거됨).
export class LeadingEmotionExtractor {
  private head = "";
  private decided = false;

  push(delta: string): { emotion?: Emotion; text: string } {
    if (this.decided) return { text: delta };
    this.head += delta;

    const m = this.head.match(LEADING_TAG_RE);
    if (m) {
      this.decided = true;
      const val = m[1].toLowerCase();
      if (isEmotion(val)) {
        return { emotion: val, text: this.head.slice(m[0].length) };
      }
      // 무효 태그 → neutral, 전체를 발화로 (문장 분할 후 sanitize가 태그 제거)
      return { emotion: DEFAULT_EMOTION, text: this.head };
    }

    // 아직 완성된 선두 태그가 없다 — 이게 태그가 될 가능성이 있으면 계속 버퍼.
    const trimmed = this.head.replace(/^\s+/, "");
    const couldBeTag =
      trimmed === "" || "[[".startsWith(trimmed.slice(0, 2)) || trimmed.startsWith("[[");
    if (!couldBeTag || this.head.length > 24) {
      this.decided = true;
      return { emotion: DEFAULT_EMOTION, text: this.head };
    }
    return { text: "" }; // 태그 후보 — 더 기다림
  }

  // 스트림 종료 시 남은 버퍼 방출 (아직 감정 미확정이면 neutral).
  flush(): { emotion?: Emotion; text: string } {
    if (this.decided) return { text: "" };
    this.decided = true;
    return { emotion: DEFAULT_EMOTION, text: this.head };
  }
}
