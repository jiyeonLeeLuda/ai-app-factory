// 립싱크 계층 인터페이스 (w3-spec S4 — RN 포팅 대비, 경계만 긋고 추상화는 최소).
// 통화 로직/렌더는 이 인터페이스에만 의존 → W2.9 RN 때 네이티브 어댑터로 교체.

export interface LipSync {
  /** 재생 <audio> 엘리먼트에 AnalyserNode를 부착 (앱 수명 1회 — createMediaElementSource 재호출 throw 방지). */
  attach(audioEl: HTMLAudioElement): void;
  /** "통화 시작" 제스처에서 AudioContext.resume (오디오 unlock과 한 묶음). */
  resume(): Promise<void>;
  /** 현재 재생 진폭 기반 aa 목표값(0..1). 재생이 멈췄으면 0(입 다물기). */
  read(): number;
  /** 자원 정리. */
  dispose(): void;
}
