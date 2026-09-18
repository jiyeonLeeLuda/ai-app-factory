// 오디오 캡처/재생 계층 인터페이스 (w2-spec S4 — RN 포팅 대비).
// 통화 로직(턴 관리·ws 전송·재생 큐)은 이 인터페이스에만 의존한다.
// W2는 웹 어댑터(getUserMedia+MediaRecorder+VAD / <audio> 큐)만 구현.
// W2.9 RN 포팅 때 이 어댑터만 네이티브로 교체하면 상위 통화 로직은 그대로 산다.

export interface AudioCapture {
  /** 마이크 획득 + VAD 시작. 권한 거부/실패 시 reject. */
  start(): Promise<void>;
  /** 캡처 종료 + 자원 정리. */
  stop(): void;
  /** 발화 종료(VAD 침묵감지)마다 그 발화 오디오(Blob)를 전달받을 콜백 등록. */
  onUtterance(cb: (blob: Blob) => void): void;
  /** 현재 입력 음량(0..1) — 마이크 인디케이터 바에 사용 (w3-spec S1.8). */
  getInputLevel(): number;
  /** 음소거 토글 — mic 트랙 enabled 제어 (S1.9). */
  setMuted(muted: boolean): void;
}

export interface AudioPlayer {
  /** 사용자 제스처 구간에서 무음 재생으로 autoplay unlock (단일 엘리먼트). */
  unlock(): void;
  /** 도착한 문장 오디오를 큐에 넣어 순서대로 재생. */
  enqueue(blob: Blob): void;
  /** autoplay 차단 폴백("탭하여 계속") 후 사용자 탭으로 재생 재개. */
  resume(): void;
  /** 큐 비우기 + 재생 중지 + 자원 정리. */
  clear(): void;
  /** 립싱크 AnalyserNode 부착 대상 = 재생 <audio> 엘리먼트 (unlock 후 존재). */
  getAudioElement(): HTMLAudioElement | null;
}
