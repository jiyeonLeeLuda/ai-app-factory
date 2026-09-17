"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WebAudioCapture } from "@/lib/audio/webCapture";
import { WebAudioPlayer } from "@/lib/audio/webPlayer";
import type { AudioCapture, AudioPlayer } from "@/lib/audio/types";

// 통화 화면 (w2-spec S1). 자막 없음 — 화면 주인공은 음성.
// 브라우저 종속 API는 lib/audio 웹 어댑터에 봉인, 이 컴포넌트는 인터페이스에만 의존.

type CallState =
  | "idle" // 진입 직후 — "전화 걸기" 대기 (autoplay/mic는 사용자 제스처 필요)
  | "connecting" // 연결 중
  | "listening" // 듣는 중
  | "speaking" // 말하는 중
  | "mic-denied" // 마이크 권한 거부/실패
  | "disconnected"; // ws 끊김

const STATE_LABEL: Record<CallState, string> = {
  idle: "",
  connecting: "연결 중…",
  listening: "듣는 중",
  speaking: "말하는 중",
  "mic-denied": "마이크 필요",
  disconnected: "연결 끊김",
};

function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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
  const [state, setState] = useState<CallState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [tapToContinue, setTapToContinue] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const stateRef = useRef<CallState>("idle");
  const connectedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setCallState = (s: CallState) => {
    stateRef.current = s;
    setState(s);
  };

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    captureRef.current?.stop();
    captureRef.current = null;
    playerRef.current?.clear();
    playerRef.current = null;
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

  // 언마운트·이탈 시 통화 종료 + 자원 정리 (S3 새로고침·이탈)
  useEffect(() => {
    const onUnload = () => cleanup();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      cleanup();
    };
  }, []);

  function startTimer() {
    if (timerRef.current) return;
    const t0 = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
  }

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
    }
    // turn-end / stt-empty / error: 통화 유지, 상태는 state 메시지가 이끈다.
  }

  async function startCall() {
    setTapToContinue(false);
    setCallState("connecting");

    // 1) autoplay unlock — 사용자 제스처(이 클릭) 구간에서 단일 <audio> unlock (S3)
    const player = new WebAudioPlayer(() => setTapToContinue(true));
    player.unlock();
    playerRef.current = player;

    // 2) 마이크 권한 (거부/실패 시 안내 + 재요청, 빈 통화 진입 금지 — S3)
    const capture = new WebAudioCapture();
    try {
      await capture.start();
    } catch (e) {
      console.error("mic 권한/획득 실패:", e);
      capture.stop();
      player.clear();
      playerRef.current = null;
      setCallState("mic-denied");
      return;
    }
    captureRef.current = capture;

    capture.onUtterance((blob) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      // 아티스트가 말하는 중이면 보내지 않음 (한 번에 한 턴 — S3)
      if (stateRef.current !== "listening") return;
      void blob.arrayBuffer().then((buf) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(buf);
      });
    });

    // 3) ws 연결 (localhost=ws, https=wss)
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws?artistId=${encodeURIComponent(artistId)}`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      connectedRef.current = true;
      startTimer();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") {
        handleControl(ev.data);
      } else {
        // 문장 오디오(mp3) — 큐에 넣어 순서대로 재생
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
      // onclose가 뒤따름 — 거기서 처리
    };
  }

  function hangup() {
    cleanup();
    router.push(`/chat/${artistSlug}`);
  }

  function reconnect() {
    cleanup();
    setElapsed(0);
    void startCall();
  }

  const initial = artistName.slice(0, 1);
  const showTimer = state === "listening" || state === "speaking";

  return (
    <main className="mx-auto flex h-dvh w-full max-w-lg flex-col items-center justify-between bg-black px-6 py-12 text-white">
      {/* 상단: 아바타 · 이름 · 상태 · 경과시간 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div
          aria-hidden
          className={
            "flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-4xl font-semibold " +
            (state === "speaking" ? "ring-4 ring-green-400/70" : "")
          }
        >
          {initial}
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold">{artistName}</p>
          <p className="mt-1 h-5 text-sm text-white/60" aria-live="polite">
            {STATE_LABEL[state]}
          </p>
          {showTimer && (
            <p className="mt-2 text-sm tabular-nums text-white/40">
              {mmss(elapsed)}
            </p>
          )}
        </div>
      </div>

      {/* 마이크 거부 안내 */}
      {state === "mic-denied" && (
        <div className="mb-6 w-full rounded-xl bg-white/5 p-4 text-center text-sm text-white/80">
          <p>마이크 권한이 필요해요.</p>
          <p className="mt-1 text-white/50">
            브라우저 주소창의 권한을 허용한 뒤 다시 시도해주세요.
          </p>
        </div>
      )}

      {/* ws 끊김 안내 */}
      {state === "disconnected" && (
        <div className="mb-6 w-full rounded-xl bg-white/5 p-4 text-center text-sm text-white/80">
          <p>연결이 끊겼어요. 진행 중이던 턴은 취소됩니다.</p>
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
          className="mb-4 rounded-full bg-white/15 px-5 py-2 text-sm"
        >
          탭하여 계속
        </button>
      )}

      {/* 하단 컨트롤 */}
      <div className="flex w-full items-center justify-center gap-6">
        {state === "idle" && (
          <button
            type="button"
            onClick={() => void startCall()}
            className="rounded-full bg-green-500 px-8 py-4 text-base font-semibold text-black"
          >
            전화 걸기
          </button>
        )}

        {state === "mic-denied" && (
          <>
            <button
              type="button"
              onClick={() => void startCall()}
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
          </>
        )}

        {state === "disconnected" && (
          <>
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
          </>
        )}

        {(state === "connecting" ||
          state === "listening" ||
          state === "speaking") && (
          <button
            type="button"
            onClick={hangup}
            aria-label="끊기"
            className="rounded-full bg-red-500 px-8 py-4 text-base font-semibold"
          >
            끊기
          </button>
        )}
      </div>
    </main>
  );
}
