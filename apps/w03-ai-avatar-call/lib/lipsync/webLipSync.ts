import type { LipSync } from "./types";
import { rmsFromTimeDomain, rmsToAa } from "./aa";

// Web Audio 진폭 립싱크 어댑터 (w3-spec S4 ★ — 립싱크 3함정 방어).
//   ① createMediaElementSource 는 element당 1회만(재호출 throw) → attach 가드.
//   ② analyser 를 destination 에도 반드시 connect(안 하면 소리가 사라짐).
//   ③ analyser 는 same-origin/blob 오디오만 값을 준다(cross-origin=0). TTS mp3는 ws→Blob→objectURL이라 충족.

export class WebLipSync implements LipSync {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private timeData = new Uint8Array(0);
  private attached = false;

  attach(audioEl: HTMLAudioElement): void {
    if (this.attached) return; // 재부착 금지 (createMediaElementSource 재호출 throw)
    this.attached = true;
    this.audioEl = audioEl;

    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();

    let source: MediaElementAudioSourceNode;
    try {
      source = this.ctx.createMediaElementSource(audioEl);
    } catch (e) {
      // 이미 다른 소스에 물린 엘리먼트 등 — 립싱크만 비활성(오디오 재생은 유지)
      console.error("[lipsync] createMediaElementSource 실패:", e);
      return;
    }

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.timeData = new Uint8Array(this.analyser.fftSize);

    // 그래프: element → analyser → destination (destination 연결 필수 — 함정 ②)
    source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  async resume(): Promise<void> {
    try {
      await this.ctx?.resume();
    } catch {
      /* noop */
    }
  }

  read(): number {
    const el = this.audioEl;
    // 재생이 멈췄으면(문장 사이·종료) 입 다물기 (S3)
    if (!this.analyser || !el || el.paused || el.ended) return 0;
    this.analyser.getByteTimeDomainData(this.timeData);
    return rmsToAa(rmsFromTimeDomain(this.timeData));
  }

  dispose(): void {
    this.analyser?.disconnect();
    this.analyser = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.audioEl = null;
    this.attached = false;
  }
}
