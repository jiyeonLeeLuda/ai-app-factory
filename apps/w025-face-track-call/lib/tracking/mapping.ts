// 표정 매핑 룰 (자작 — 격차 코어, W2.5 S4). MediaPipe 52 blendshape → VRM 16 중 핵심 최소셋.
// 순수 함수 — 브라우저 의존 없음 → 단위 테스트로 자동 검증 가능(S5).
// POC라 스무딩(lerp)·스케일 보정·좌우 캘리브레이션은 범위 밖(first-pass = "임계값 반영").

import type { Expr, Head } from "./types";
import { NEUTRAL_EXPR, NEUTRAL_HEAD } from "./types";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * MediaPipe FaceLandmarker의 blendshape 점수 맵(name→score)을 VRM expression 값으로 변환.
 * 빈 입력(얼굴 유실)이면 neutral 반환 (S3 — 크래시 없이 지속).
 */
export function mapBlendshapesToExpr(
  scores: Record<string, number> | null | undefined,
): Expr {
  if (!scores || Object.keys(scores).length === 0) return { ...NEUTRAL_EXPR };
  const g = (name: string) => scores[name] ?? 0;
  return {
    aa: clamp01(g("jawOpen")),
    blink: clamp01((g("eyeBlinkLeft") + g("eyeBlinkRight")) / 2),
    happy: clamp01((g("mouthSmileLeft") + g("mouthSmileRight")) / 2),
    surprised: clamp01(g("browInnerUp")),
  };
}

/** MediaPipe categories 배열([{categoryName, score}])을 name→score 맵으로 정규화. */
export function categoriesToScores(
  categories: { categoryName?: string; displayName?: string; score: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of categories) {
    const name = c.categoryName || c.displayName;
    if (name) out[name] = c.score;
  }
  return out;
}

const clampUnit = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

/**
 * facialTransformationMatrix(4×4, column-major 16-length)에서 고개 회전을 추출.
 * three의 Euler 'YXZ' 추출 규약을 따른다(렌더러가 같은 순서로 적용).
 * 잘못된 입력이면 neutral head.
 */
export function mapMatrixToHead(
  data: number[] | Float32Array | null | undefined,
): Head {
  if (!data || data.length < 11) return { ...NEUTRAL_HEAD };
  // column-major: te[col*4 + row]
  const m11 = data[0],
    m21 = data[1],
    m31 = data[2];
  const m22 = data[5];
  const m13 = data[8],
    m23 = data[9],
    m33 = data[10];

  // three Euler.setFromRotationMatrix, order 'YXZ'
  const pitch = Math.asin(-clampUnit(m23));
  let yaw: number;
  let roll: number;
  if (Math.abs(m23) < 0.9999999) {
    yaw = Math.atan2(m13, m33);
    roll = Math.atan2(m21, m22);
  } else {
    yaw = Math.atan2(-m31, m11);
    roll = 0;
  }
  return { yaw, pitch, roll };
}
