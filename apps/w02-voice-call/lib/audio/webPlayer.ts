import type { AudioPlayer } from "./types";

// 단일 <audio> 엘리먼트를 재사용해 문장 오디오를 순차 재생하는 웹 어댑터 (w2-spec S3/S4).
// ⚠️ 문장마다 new Audio() 금지 — iOS에서 gesture 연결이 끊겨 autoplay 차단됨.
//    unlock()에서 만든 엘리먼트 하나를 src 교체하며 재사용한다.

// 0-sample 무음 WAV (autoplay unlock 용)
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

export class WebAudioPlayer implements AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private queue: Blob[] = [];
  private playing = false;
  private currentUrl: string | null = null;
  private readonly onBlocked?: () => void;

  constructor(onBlocked?: () => void) {
    this.onBlocked = onBlocked;
  }

  unlock(): void {
    if (!this.audio) {
      this.audio = new Audio(); // 단일 엘리먼트 — 이후 재사용
      this.audio.addEventListener("ended", () => {
        this.revokeCurrent();
        this.playing = false;
        this.playNext();
      });
      this.audio.addEventListener("error", () => {
        this.revokeCurrent();
        this.playing = false;
        this.playNext();
      });
    }
    // 사용자 제스처 구간에서 무음 재생→정지로 autoplay 권한 확보
    try {
      this.audio.src = SILENT_WAV;
      const p = this.audio.play();
      if (p) p.then(() => this.audio?.pause()).catch(() => {});
    } catch {
      /* noop */
    }
  }

  enqueue(blob: Blob): void {
    this.queue.push(blob);
    if (!this.playing) this.playNext();
  }

  resume(): void {
    // autoplay 차단 폴백에서 사용자 탭으로 호출 — 현재 프레임부터 다시 재생 시도
    this.playing = false;
    this.playNext();
  }

  clear(): void {
    this.queue = [];
    this.revokeCurrent();
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        /* noop */
      }
      this.audio.removeAttribute("src");
    }
    this.playing = false;
  }

  private revokeCurrent(): void {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }

  private playNext(): void {
    if (this.playing || !this.audio) return;
    const blob = this.queue.shift();
    if (!blob) return;
    this.playing = true;
    this.currentUrl = URL.createObjectURL(blob);
    this.audio.src = this.currentUrl;
    const p = this.audio.play();
    if (p) {
      p.catch(() => {
        // autoplay 차단 등 — 폴백 노출. 사용자 탭으로 resume()에서 재개.
        this.playing = false;
        this.onBlocked?.();
      });
    }
  }
}
