"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WebAudioCapture } from "@/lib/audio/webCapture";
import { WebAudioPlayer } from "@/lib/audio/webPlayer";
import type { AudioCapture, AudioPlayer } from "@/lib/audio/types";
import { WebLipSync } from "@/lib/lipsync/webLipSync";
import type { LipSync } from "@/lib/lipsync/types";
import { createCharacterRenderer, type AvatarRenderer } from "@/lib/render/characterRenderer";

// AI 아바타 음성통화 화면 (w3-spec S1). 화면 주인공 = luda 아바타(얼굴 클로즈업).
// 팬 자기 영상·PIP 없음. WebRTC/룸/역할 없음(1인 사용 — 팬↔서버 ws).
// 브라우저 종속 API(three·getUserMedia·<audio>·AudioContext)는 lib 어댑터에 봉인.

const VRM_URL = "/models/luda.vrm";

type CallState =
  | "idle" // "통화 시작" 대기 (권한/오디오는 제스처 필요)
  | "connecting"
  | "listening"
  | "speaking"
  | "mic-denied"
  | "disconnected";

const STATE_LABEL: Record<CallState, string> = {
  idle: "",
  connecting: "연결 중…",
  listening: "듣는 중",
  speaking: "말하는 중",
  "mic-denied": "마이크 필요",
  disconnected: "연결 끊김",
};

// secure context 판정 (렌더 시점). localhost는 http여도 secure → mic OK. 내부망 IP+http면 불가(S3).
function initialBoot(): { ok: boolean; error: string | null } {
  if (typeof window === "undefined") return { ok: true, error: null };
  if (!window.isSecureContext) {
    return { ok: false, error: "HTTPS로 접속해야 마이크를 쓸 수 있어요." };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: "이 브라우저/접속 방식에서는 마이크를 쓸 수 없어요." };
  }
  return { ok: true, error: null };
}

export default function CallScreen({
  artistId,
  artistName,
  artistSlug,
}: {
  artistId: string;
  artistName: string;
  artistSlug: string;
}) {
  const router = useRouter();
  const [boot] = useState(initialBoot);
  const [state, setState] = useState<CallState>("idle");
  const [error] = useState<string | null>(boot.error);
  const [muted, setMuted] = useState(false);
  const [tapToContinue, setTapToContinue] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelBarRef = useRef<HTMLDivElement | null>(null);
  const debugRef = useRef<HTMLDivElement | null>(null); // [진단, 추후 제거] 손 좌표 오버레이
  const wsRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const lipsyncRef = useRef<LipSync | null>(null);
  const rendererRef = useRef<AvatarRenderer | null>(null);
  const stateRef = useRef<CallState>("idle");
  const connectedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const setCallState = (s: CallState) => {
    stateRef.current = s;
    setState(s);
  };

  // ── 아바타 로드 + 구동 rAF (마운트 즉시 — 권한과 무관. 대기 중에도 idle blink/breathe로 살아있게, S1.3) ──
  useEffect(() => {
    if (!boot.ok || !canvasRef.current) return;
    const renderer = createCharacterRenderer();
    rendererRef.current = renderer;
    let alive = true;

    renderer
      .load(canvasRef.current, VRM_URL)
      .then(() => {
        if (alive) setAvatarReady(true);
      })
      .catch((e) => {
        console.error("[render] VRM 로드 실패", e);
      });

    // 립싱크 aa → 입, 마이크 음량 → 인디케이터 바 (React state 안 거치고 직접 구동)
    const drive = () => {
      rafRef.current = requestAnimationFrame(drive);
      const aa = lipsyncRef.current?.read() ?? 0;
      rendererRef.current?.setMouthOpen(aa);
      if (levelBarRef.current) {
        const lvl =
          stateRef.current === "listening"
            ? (captureRef.current?.getInputLevel() ?? 0)
            : 0;
        levelBarRef.current.style.transform = `scaleX(${lvl})`;
      }
      // [진단, 추후 제거] 손·머리 좌표를 화면에 표시 (콘솔 없이 읽어서 알려주시게)
      if (debugRef.current) {
        debugRef.current.textContent = rendererRef.current?.getDebugInfo() ?? "";
      }
    };
    rafRef.current = requestAnimationFrame(drive);

    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [boot.ok]);

  const cleanup = () => {
    captureRef.current?.stop();
    captureRef.current = null;
    playerRef.current?.clear();
    playerRef.current = null;
    lipsyncRef.current?.dispose();
    lipsyncRef.current = null;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      try {
        wsRef.current.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    }
    connectedRef.current = false;
  };

  // 언마운트·이탈 시 종료 + 자원 정리 (S3 새로고침·이탈 — PeerConnection 없음, ws만 닫으면 됨)
  useEffect(() => {
    const onUnload = () => cleanup();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      cleanup();
    };
  }, []);

  function handleControl(raw: string) {
    let msg: { type?: string; value?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "state") {
      if (msg.value === "speaking") setCallState("speaking");
      else if (msg.value === "listening" || msg.value === "connected") {
        setCallState("listening");
      }
    } else if (msg.type === "emotion" && msg.value) {
      // 격차 ②: LLM emotion → VRM 표정 lerp (렌더러가 ~0.3s 부드럽게 전환)
      rendererRef.current?.setEmotion(msg.value);
    } else if (msg.type === "gesture" && msg.value) {
      // 선턴 인사 = 손 흔들기 + 시네마틱 줌아웃
      rendererRef.current?.playGesture(msg.value);
    }
    // turn-end / stt-empty / error: 통화 유지, 상태는 state 메시지가 이끈다.
  }

  async function startCall() {
    if (startedRef.current) return;
    startedRef.current = true;
    setTapToContinue(false);
    setCallState("connecting");

    // 한 제스처에서: 오디오 unlock + 립싱크 attach/resume + 마이크 권한 (S1.2 · 2제스처 unlock 함정 G4)
    const player = new WebAudioPlayer(() => setTapToContinue(true));
    player.unlock();
    playerRef.current = player;

    const lipsync = new WebLipSync();
    const audioEl = player.getAudioElement();
    if (audioEl) {
      lipsync.attach(audioEl); // createMediaElementSource 1회
      await lipsync.resume(); // AudioContext.resume (이 제스처 안에서)
    }
    lipsyncRef.current = lipsync;

    const capture = new WebAudioCapture();
    try {
      await capture.start();
    } catch (e) {
      const name = (e as DOMException)?.name;
      // 중단류(AbortError/InvalidStateError)는 사용자 거부 아님 → 조용히 무시(오탐 방지, S3)
      if (name === "AbortError" || name === "InvalidStateError") {
        startedRef.current = false;
        setCallState("idle");
        return;
      }
      console.error("mic 권한/획득 실패:", e);
      capture.stop();
      player.clear();
      playerRef.current = null;
      lipsync.dispose();
      lipsyncRef.current = null;
      setCallState("mic-denied");
      return;
    }
    captureRef.current = capture;
    capture.setMuted(muted);

    capture.onUtterance((blob) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (stateRef.current !== "listening") return; // 한 번에 한 턴 (S3 barge-in Out)
      void blob.arrayBuffer().then((buf) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(buf);
      });
    });

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws?artistId=${encodeURIComponent(artistId)}`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      connectedRef.current = true;
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") {
        handleControl(ev.data);
      } else {
        // 문장 오디오(mp3) — Blob(same-origin)로 큐에 넣어 순차 재생 (립싱크가 analyser로 진폭 추출)
        const blob = new Blob([ev.data as ArrayBuffer], { type: "audio/mpeg" });
        playerRef.current?.enqueue(blob);
      }
    };
    ws.onclose = () => {
      if (connectedRef.current && stateRef.current !== "idle") {
        setCallState("disconnected");
        captureRef.current?.stop();
      }
    };
    ws.onerror = () => {
      /* onclose가 뒤따름 */
    };
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    captureRef.current?.setMuted(next);
  }

  function hangup() {
    cleanup();
    router.push(`/chat/${artistSlug}`);
  }

  function reconnect() {
    cleanup();
    startedRef.current = false;
    void startCall();
  }

  const active =
    state === "connecting" || state === "listening" || state === "speaking";

  return (
    <div className="relative h-dvh w-full bg-black text-white">
      {/* luda 아바타 — 화면을 꽉 채움 (얼굴 클로즈업). 팬 자기 영상 없음. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* [진단, 추후 제거] 인사 중 손·머리 좌표 — 콘솔 없이 화면에서 읽어 알려주시게 */}
      <div
        ref={debugRef}
        className="pointer-events-none absolute left-2 top-2 z-40 rounded bg-black/60 px-2 py-1 font-mono text-[10px] leading-tight text-lime-300"
      />

      {/* 아바타 로딩 표시 (빈 캔버스 금지, S3) */}
      {boot.ok && !avatarReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-white/50">
          아바타를 불러오는 중…
        </div>
      )}

      {/* 상단: 이름 · 상태 */}
      <div className="absolute left-0 right-0 top-6 z-20 flex flex-col items-center">
        <p className="text-xl font-semibold drop-shadow">{artistName}</p>
        <p className="mt-1 h-5 text-sm text-white/70 drop-shadow" aria-live="polite">
          {STATE_LABEL[state]}
        </p>
      </div>

      {/* secure context 미충족 등 부팅 에러 */}
      {!boot.ok && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 px-6 text-center">
          <div className="w-full max-w-sm">
            <p className="text-lg font-semibold">통화를 시작할 수 없어요</p>
            <p className="mt-2 text-sm text-red-300">{error}</p>
            <button
              type="button"
              onClick={hangup}
              className="mt-5 rounded-lg border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
            >
              채팅방으로
            </button>
          </div>
        </div>
      )}

      {/* 시작 오버레이 — canvas는 뒤에 항상 마운트된 채, 이 클릭(제스처)에서 권한/오디오 unlock (S1.2) */}
      {boot.ok && state === "idle" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-6 text-center">
          <div className="w-full max-w-sm">
            <p className="text-lg font-semibold">{artistName}와 통화</p>
            <p className="mt-2 text-xs text-white/60">
              시작을 누르면 마이크 권한을 요청해요. 허용해 주세요.
            </p>
            <button
              type="button"
              onClick={() => void startCall()}
              className="mt-5 rounded-full bg-green-500 px-8 py-3 text-base font-semibold text-black"
            >
              📞 통화 시작
            </button>
          </div>
        </div>
      )}

      {/* 마이크 거부 안내 */}
      {state === "mic-denied" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-6 text-center">
          <div className="w-full max-w-sm">
            <p className="text-base font-semibold">마이크 권한이 필요해요</p>
            <p className="mt-1 text-sm text-white/60">
              브라우저 주소창의 권한을 허용한 뒤 다시 시도해주세요.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={reconnect}
                className="rounded-full bg-white/15 px-6 py-3 text-sm font-medium"
              >
                다시 시도
              </button>
              <button
                type="button"
                onClick={hangup}
                className="rounded-full bg-red-500 px-6 py-3 text-sm font-medium"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ws 끊김 안내 */}
      {state === "disconnected" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-6 text-center">
          <div className="w-full max-w-sm">
            <p className="text-base font-semibold">연결이 끊겼어요</p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={reconnect}
                className="rounded-full bg-white/15 px-6 py-3 text-sm font-medium"
              >
                재연결
              </button>
              <button
                type="button"
                onClick={hangup}
                className="rounded-full bg-red-500 px-6 py-3 text-sm font-medium"
              >
                종료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* autoplay 차단 폴백 */}
      {tapToContinue && (
        <button
          type="button"
          onClick={() => {
            setTapToContinue(false);
            playerRef.current?.resume();
          }}
          className="absolute bottom-28 left-1/2 z-30 -translate-x-1/2 rounded-full bg-white/15 px-5 py-2 text-sm"
        >
          탭하여 계속
        </button>
      )}

      {/* 하단: 마이크 인디케이터(자기 영상 대신 "들리고 있음" 피드백) + 컨트롤 */}
      {active && (
        <div className="absolute bottom-8 left-1/2 z-20 flex w-full max-w-xs -translate-x-1/2 flex-col items-center gap-5">
          {/* 입력 음량 바 (scaleX를 rAF에서 직접 구동) */}
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/15">
            <div
              ref={levelBarRef}
              className="h-full w-full origin-left rounded-full bg-green-400"
              style={{ transform: "scaleX(0)" }}
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "음소거 해제" : "음소거"}
              className={
                "rounded-full px-6 py-3 text-sm font-medium " +
                (muted ? "bg-white/30" : "bg-white/15")
              }
            >
              {muted ? "🔇 음소거됨" : "🎙 음소거"}
            </button>
            <button
              type="button"
              onClick={hangup}
              aria-label="끊기"
              className="rounded-full bg-red-500 px-8 py-3 text-base font-semibold"
            >
              끊기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
