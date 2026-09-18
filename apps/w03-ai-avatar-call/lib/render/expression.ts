// emotion → VRM expression 키 매핑 (w3-spec S4 격차 ②). 순수함수 — S5 단위테스트 대상.
// luda.vrm(VRoid VRM1)은 happy/angry/sad/relaxed/surprised/neutral 표정 프리셋을 내장 → 1:1.
// 무효/미확정 값은 neutral로 폴백(크래시·빈표정 금지, S3).

import { EMOTIONS, DEFAULT_EMOTION, isEmotion, type Emotion } from "../voice/emotion";

// VRM expressionManager.setValue 에 넣을 표정 프리셋 키(감정 6종 그대로).
export type ExpressionKey = Emotion;

// 렌더러가 lerp로 켜고 끄는 감정 표정 키 목록 (neutral은 "아무 표정도 아님"이라 가중치 0으로 둔다).
export const EMOTION_EXPRESSION_KEYS: Exclude<ExpressionKey, "neutral">[] = [
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
];

// emotion 값(문자열) → 표정 키. enum 밖이면 neutral.
export function emotionToExpression(value: string): ExpressionKey {
  return isEmotion(value) ? value : DEFAULT_EMOTION;
}

// 6개 emotion 전부 유효 매핑을 갖는지 (테스트 편의).
export const ALL_EMOTIONS = EMOTIONS;
