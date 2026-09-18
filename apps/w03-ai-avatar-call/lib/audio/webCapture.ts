import type { AudioCapture } from "./types";

// getUserMedia + MediaRecorder + 자작 VAD 웹 어댑터 (w2-spec S4).
// VAD = Web Audio API 볼륨(RMS) 임계 + 침묵 타이머. 임계·침묵길이는 상수로 두고 실측 조정.
// 발화 종료(침묵 감지)마다 그 발화만 WebM Blob으로 잘라 onUtterance로 넘긴다.

const SILENCE_RMS = 0.012; // 침묵 판정 볼륨 임계 (실측 조정 대상)
const SILENCE_MS = 900; // 이만큼 침묵이 이어지면 발화 종료로 판정
const MIN_SPEECH_MS = 300; // 이보다 짧으면 노이즈로 보고 버림

export class WebAudioCapture implements AudioCapture {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private rafId: number | null = null;
  private cb: ((blob: Blob) => void) | null = null;
  private active = false;
  private speaking = false;
  private speechStart = 0;
  private lastVoiceTs = 0;
  private mimeType = "audio/webm";
  private timeData = new Uint8Array(0);
  private lastRms = 0; // 마이크 인디케이터용 최근 입력 음량

  onUtterance(cb: (blob: Blob) => void): void {
    this.cb = cb;
  }

  // 현재 입력 음량(0..1 근사) — VAD 임계 부근을 잘 보이게 살짝 증폭 (S1.8 인디케이터)
  getInputLevel(): number {
    const v = this.lastRms * 6;
    return v > 1 ? 1 : v;
  }

  // 음소거: mic 트랙 enabled 토글 (S1.9). 음소거 중엔 rms도 0으로 눌러 인디케이터·VAD 정지.
  setMuted(muted: boolean): void {
    this.stream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    if (muted) this.lastRms = 0;
  }

  async start(): Promise<void> {
    // secure context(localhost 예외)에서만 동작 (S4). 거부/실패 시 throw → 호출부가 안내.
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.timeData = new Uint8Array(this.analyser.fftSize);

    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      this.mimeType = "audio/webm;codecs=opus";
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      this.mimeType = "audio/webm";
    }

    this.active = true;
    this.beginSegment();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private beginSegment(): void {
    if (!this.stream || !this.active) return;
    this.chunks = [];
    this.speaking = false;
    this.speechStart = 0;
    this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const spokeMs = this.lastVoiceTs - this.speechStart;
      const blob = new Blob(this.chunks, { type: this.mimeType });
      const hadSpeech =
        this.speechStart > 0 && spokeMs >= MIN_SPEECH_MS && blob.size > 0;
      if (hadSpeech && this.cb) this.cb(blob);
      if (this.active) this.beginSegment(); // 다음 발화 대기
    };
    this.recorder.start();
  }

  private loop = (): void => {
    if (!this.active || !this.analyser) return;
    this.analyser.getByteTimeDomainData(this.timeData);

    let sum = 0;
    for (let i = 0; i < this.timeData.length; i += 1) {
      const v = (this.timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeData.length);
    this.lastRms = rms;
    const now = performance.now();

    if (rms > SILENCE_RMS) {
      if (!this.speaking) {
        this.speaking = true;
        this.speechStart = now;
      }
      this.lastVoiceTs = now;
    } else if (this.speaking && now - this.lastVoiceTs > SILENCE_MS) {
      // 발화 종료 — recorder stop → onstop에서 blob 전달 + 새 segment 시작
      if (this.recorder && this.recorder.state === "recording") {
        this.recorder.stop();
      }
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  stop(): void {
    this.active = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        /* noop */
      }
    }
    this.recorder = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
  }
}
