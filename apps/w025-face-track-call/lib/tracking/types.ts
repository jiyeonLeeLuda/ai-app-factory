// 트래킹/렌더 공유 계약 (W2.5 S4 계층 분리). 브라우저 API에 의존하지 않는 순수 타입.
// DataChannel 페이로드 = { expr, head } 경량 JSON — 프레임마다 P2P로 오간다.

// VRM 1.0 expression 중 이번 격차의 핵심 최소셋 (S4 매핑 룰)
export type Expr = {
  aa: number; // 입 벌림  (jawOpen)
  blink: number; // 눈 깜빡  (eyeBlink L/R 평균)
  happy: number; // 미소     (mouthSmile L/R 평균)
  surprised: number; // 놀람 (browInnerUp) — 스트레치
};

// 고개 회전 (라디안). facialTransformationMatrix에서 추출.
export type Head = {
  yaw: number; // 좌우 (Y축)
  pitch: number; // 상하 (X축)
  roll: number; // 기울임 (Z축)
};

export type TrackingFrame = {
  expr: Expr;
  head: Head;
};

export const NEUTRAL_EXPR: Expr = { aa: 0, blink: 0, happy: 0, surprised: 0 };
export const NEUTRAL_HEAD: Head = { yaw: 0, pitch: 0, roll: 0 };
export const NEUTRAL_FRAME: TrackingFrame = {
  expr: NEUTRAL_EXPR,
  head: NEUTRAL_HEAD,
};

// ── 계층 분리 인터페이스 (S4 — RN 포팅 대비, 경계만 긋고 추상화는 최소) ──
export interface FaceTracker {
  /** 비디오 소스를 붙이고 매 프레임 트래킹 프레임을 콜백으로 흘린다. */
  start(video: HTMLVideoElement, onFrame: (frame: TrackingFrame) => void): Promise<void>;
  stop(): void;
}

export interface CharacterRenderer {
  /** VRM 로드 + 렌더 루프 시작. */
  load(canvas: HTMLCanvasElement, url: string): Promise<void>;
  /** 최신 표정/고개 값 반영 (React state 거치지 않고 직접 호출). */
  apply(frame: TrackingFrame): void;
  dispose(): void;
}
