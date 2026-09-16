import OpenAI from "openai";

// API 키는 서버에서만 사용 (클라이언트 노출 금지 — 스트림은 서버 경유). S4
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  // 라우트에서 잡아 인라인 에러로 노출 (S3 스트리밍 실패)
  console.warn("OPENAI_API_KEY가 설정되지 않았습니다.");
}

export const openai = new OpenAI({ apiKey: apiKey ?? "" });

// 모델은 환경변수 주입, 하드코딩 금지 (S4). 기본 gpt-5-nano.
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5-nano";

// 호출당 예산 방어 (S4)
export const MAX_OUTPUT_TOKENS = 1000;
// gpt-5 계열은 추론모델 — 기본 추론이 max_output_tokens(1000)를 다 먹어 텍스트가
// 비는 현상 실측(P1). 짧은 채팅 답변엔 추론이 불필요하므로 minimal로 눌러
// 예산을 답변 텍스트에 쓴다. 환경변수로 조정 가능.
export const REASONING_EFFORT = (process.env.OPENAI_REASONING_EFFORT ??
  "minimal") as "minimal" | "low" | "medium" | "high";
export const HISTORY_TURNS = 20; // 최근 N턴만 재전송
export const USER_MESSAGE_MAX_CHARS = 2000; // 긴 입력 상한 (S3)
