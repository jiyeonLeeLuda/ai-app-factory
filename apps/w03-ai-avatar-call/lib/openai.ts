import OpenAI from "openai";

// API 키는 서버에서만 사용 (클라이언트 노출 금지). p1-spec S4 / w2-spec S4
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("OPENAI_API_KEY가 설정되지 않았습니다.");
}

export const openai = new OpenAI({ apiKey: apiKey ?? "" });

// 모델은 환경변수 주입, 하드코딩 금지 (S4). 기본 gpt-5-nano, W3 대화품질용 상향 = gpt-5.6-luna(.env).
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5-nano";

// 호출당 예산 방어 (S4)
export const MAX_OUTPUT_TOKENS = 1000;

// gpt-5 계열은 추론모델 — 기본 추론이 max_output_tokens(1000)를 다 먹어 텍스트가
// 비는 현상 실측(P1 run2). 통화에서 벙어리는 치명적이므로 추론을 최소로 눌러 예산을 답변에 쓴다.
// ⚠️ 지원값이 모델마다 다르다: gpt-5-nano='minimal', gpt-5.6-luna='none/low/medium/high/xhigh/max'
//    (luna는 'minimal' 미지원 → 400 실측). 통화 지연 최소화 = 'none'(추론 없음). 환경변수로 조정.
export const REASONING_EFFORT = (process.env.OPENAI_REASONING_EFFORT ??
  "none") as "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export const HISTORY_TURNS = 20; // 최근 N턴만 재전송
export const USER_MESSAGE_MAX_CHARS = 2000; // 긴 입력 상한 (p1-spec S3)

// ── 음성 (w3-spec S4) ──────────────────────────────────────────
export const STT_MODEL = "gpt-4o-mini-transcribe"; // 발화 단위 파일 전사(HTTP)
// TTS 모델·보이스·말투 전부 env로 교체 가능 (실측하며 귀로 고름).
export const TTS_MODEL = process.env.TTS_MODEL ?? "gpt-4o-mini-tts"; // 문장 단위 TTS(HTTP), mp3
// luda = 밝은 소녀 톤. 후보: shimmer(밝고 가벼움)·nova(밝은 여성)·coral(따뜻)·sage(부드러움). env로 교체.
export const TTS_VOICE = process.env.TTS_VOICE ?? "shimmer";
// gpt-4o-mini-tts는 instructions로 딜리버리(톤·속도·감정)를 조종 가능 — 보이스 이름보다 큰 지렛대.
export const TTS_INSTRUCTIONS =
  process.env.TTS_INSTRUCTIONS ??
  "밝고 발랄한 10대 후반~20대 초반 소녀 목소리로, 에너지 넘치고 통통 튀게. 말끝을 생기 있게 올리고, 친구에게 신나서 재잘대듯 리듬감 있고 경쾌하게. 절대 차분·나른·중년·낮은 톤이 아니게 — 명랑하고 발랄하게.";
