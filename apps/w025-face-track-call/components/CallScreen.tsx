"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { connectSignaling, type SignalingClient } from "@/lib/signaling/client";
import type { DesiredRole, Role, ServerMessage } from "@/lib/signaling/protocol";
import { createPeerConnection } from "@/lib/rtc/peer";
import { createFaceTracker } from "@/lib/tracking/faceTracker";
import { createCharacterRenderer } from "@/lib/render/characterRenderer";
import type { TrackingFrame } from "@/lib/tracking/types";

const VRM_URL = "/models/luda.vrm";

type Status =
  | "init"
  | "waiting" // 혼자 — 상대 기다림 (S3)
  | "connecting" // 상대 입장, 협상 중
  | "connected"
  | "room-full"
  | "role-taken" // 고른 역할이 이미 참여 중 (v1.4)
  | "ended"
  | "error";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// secure context/브라우저 지원을 렌더 시점에 판정 (effect에서 동기 setState 회피, S3 함정)
function initialBoot(): { status: Status; error: string | null } {
  if (typeof window === "undefined") return { status: "init", error: null };
  if (!window.isSecureContext) {
    return { status: "error", error: "HTTPS로 접속해야 카메라를 쓸 수 있습니다." };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      status: "error",
      error: "이 브라우저/접속 방식에서는 카메라를 쓸 수 없습니다. HTTPS로 접속해주세요.",
    };
  }
  return { status: "init", error: null };
}

export default function CallScreen({
  room,
  as,
}: {
  room: string;
  as: DesiredRole;
}) {
  const router = useRouter();

  const [boot] = useState(initialBoot);
  const [status, setStatus] = useState<Status>(boot.status);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(boot.error);
  const [mobile] = useState<boolean>(() => isMobile());
  const [facing, setFacing] = useState<"user" | "environment">("user");

  // ── refs (렌더 루프·연결은 React state를 거치지 않음, S4) ──
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null); // 로컬 웹캠
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null); // 상대 영상(팬 생얼)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null); // 상대 오디오
  const characterCanvasRef = useRef<HTMLCanvasElement | null>(null); // VRM 렌더

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sigRef = useRef<SignalingClient | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<ReturnType<typeof createFaceTracker> | null>(null);
  const rendererRef = useRef<ReturnType<typeof createCharacterRenderer> | null>(
    null,
  );
  const roleRef = useRef<Role | null>(null);
  const startedRef = useRef(false); // StrictMode 이중 init 방지
  const loggedRenderRef = useRef(false);
  const trackFrameCountRef = useRef(0);
  // ICE 후보가 remote description보다 먼저 도착하면 버퍼링 (trickle 경쟁 방지)
  const remoteReadyRef = useRef(false);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanup = useCallback(() => {
    trackerRef.current?.stop();
    rendererRef.current?.dispose();
    dcRef.current?.close();
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    sigRef.current?.close();
    trackerRef.current = null;
    rendererRef.current = null;
    dcRef.current = null;
    pcRef.current = null;
    localStreamRef.current = null;
    sigRef.current = null;
  }, []);

  const endCall = useCallback(() => {
    cleanup();
    setStatus("ended");
    router.push(`/chat/luda`);
  }, [cleanup, router]);

  // 받는쪽(callee)에서 트래킹 프레임을 얻으면: 로컬 PIP 렌더 + DataChannel 송출
  const onTrackedFrame = useCallback((frame: TrackingFrame) => {
    rendererRef.current?.apply(frame);
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      dc.send(JSON.stringify(frame));
      trackFrameCountRef.current += 1;
      // S5 셀프콜 게이트 증거: 트래킹값이 expressionManager에 반영·송출됨
      if (trackFrameCountRef.current % 60 === 1) {
        console.log("[tracking] expr applied & sent", JSON.stringify(frame.expr));
      }
    }
  }, []);

  async function init() {
    // 1) 미디어 권한 먼저 (거부 시 빈 통화 진입 금지, S3)
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: true,
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      // 프롬프트 도중 재마운트/핫리로드로 요청이 끊기면 AbortError → 사용자 거부가 아님.
      // 이걸 "권한 없음"으로 띄우면 사용자가 선택하기도 전에 실패로 보인다 → 조용히 무시.
      if (name === "AbortError" || name === "InvalidStateError") return;
      console.error("[media] getUserMedia 실패:", name, (e as Error)?.message);
      setError("카메라·마이크 권한이 필요해요. 권한을 허용하고 다시 시도해주세요.");
      setStatus("error");
      return;
    }
    localStreamRef.current = stream;
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = stream;
      await webcamVideoRef.current.play().catch(() => {});
    }

    // 2) VRM 렌더러 로드 (양쪽 다 — 로드 전 neutral 폴백, S3)
    const renderer = createCharacterRenderer();
    rendererRef.current = renderer;
    if (characterCanvasRef.current) {
      try {
        await renderer.load(characterCanvasRef.current, VRM_URL);
      } catch (e) {
        console.error("[render] VRM 로드 실패", e);
      }
    }

    // 3) 시그널링 연결 → 고른 역할(as)로 배정 요청
    sigRef.current = connectSignaling(room, as, onServerMessage);
    setStatus("waiting");
  }

  function onServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "role":
        roleRef.current = msg.role;
        setRole(msg.role);
        setupPeer(msg.role);
        break;
      case "peer-ready":
        // caller: 상대 입장 완료 → offer 생성
        setStatus("connecting");
        void makeOffer();
        break;
      case "signal":
        void onSignal(msg.payload);
        break;
      case "peer-left":
        setError("상대가 나갔어요. 통화를 종료합니다.");
        cleanup();
        setStatus("ended");
        break;
      case "room-full":
        setStatus("room-full");
        cleanup();
        break;
      case "role-taken":
        setStatus("role-taken");
        cleanup();
        break;
    }
  }

  function setupPeer(assignedRole: Role) {
    const pc = createPeerConnection();
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        sigRef.current?.send({ kind: "ice", candidate: ev.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      console.log(`[rtc] connectionState=${st}`);
      if (st === "connected") setStatus("connected");
      else if (st === "failed" || st === "disconnected") {
        setError("연결이 끊겼습니다.");
        setStatus("error");
      }
    };
    pc.ontrack = (ev) => {
      const [remoteStream] = ev.streams;
      if (!remoteStream) return;
      // callee: 팬 생얼 비디오 + 오디오 / caller: 오디오만
      if (remoteVideoRef.current && ev.track.kind === "video") {
        remoteVideoRef.current.srcObject = remoteStream;
        void remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        void remoteAudioRef.current.play().catch(() => {});
      }
    };

    const stream = localStreamRef.current;
    if (assignedRole === "caller") {
      // 거는쪽(팬): 웹캠 생얼 영상 + 마이크 오디오 송출 (평범한 미디어 트랙)
      stream?.getTracks().forEach((t) => pc.addTrack(t, stream));
      // caller가 DataChannel 생성 → callee가 표정 숫자를 여기로 보낸다
      const dc = pc.createDataChannel("expr");
      wireCallerDataChannel(dc);
    } else {
      // 받는쪽(luda): 마이크 오디오만 송출 (비디오 트랙 없음 — B안, S4)
      const audio = stream?.getAudioTracks()[0];
      if (audio && stream) pc.addTrack(audio, stream);
      // callee가 DataChannel 수신 → 표정 숫자를 여기로 보낸다
      pc.ondatachannel = (ev) => wireCalleeDataChannel(ev.channel);
      // 받는쪽: 자기 웹캠으로 얼굴 트래킹 시작 (로컬 PIP 렌더 + 송출)
      startTracking();
    }
  }

  // caller: DataChannel로 받은 표정 숫자를 큰 화면 luda에 렌더
  function wireCallerDataChannel(dc: RTCDataChannel) {
    dcRef.current = dc;
    dc.onopen = () => console.log("[rtc] datachannel open (caller)");
    dc.onmessage = (ev) => {
      let frame: TrackingFrame;
      try {
        frame = JSON.parse(ev.data) as TrackingFrame;
      } catch {
        return;
      }
      rendererRef.current?.apply(frame);
      if (!loggedRenderRef.current) {
        loggedRenderRef.current = true;
        console.log("[render] caller rendering from received expr", frame.expr);
      }
    };
  }

  // callee: 트래킹 결과를 이 채널로 송출 (onTrackedFrame에서 사용)
  function wireCalleeDataChannel(dc: RTCDataChannel) {
    dcRef.current = dc;
    dc.onopen = () => console.log("[rtc] datachannel open (callee)");
  }

  function startTracking() {
    const video = webcamVideoRef.current;
    if (!video) return;
    const tracker = createFaceTracker();
    trackerRef.current = tracker;
    tracker.start(video, onTrackedFrame).catch((e) => {
      console.error("[tracking] 시작 실패", e);
    });
  }

  async function makeOffer() {
    const pc = pcRef.current;
    if (!pc) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sigRef.current?.send({ kind: "offer", sdp: offer });
  }

  async function onSignal(payload: import("@/lib/signaling/protocol").SignalPayload) {
    const pc = pcRef.current;
    if (!pc) return;
    if (payload.kind === "offer") {
      await pc.setRemoteDescription(payload.sdp);
      await drainPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sigRef.current?.send({ kind: "answer", sdp: answer });
    } else if (payload.kind === "answer") {
      await pc.setRemoteDescription(payload.sdp);
      await drainPendingIce(pc);
    } else if (payload.kind === "ice") {
      // remote description 전이면 버퍼에 쌓아뒀다가 이후 flush
      if (!remoteReadyRef.current) {
        pendingIceRef.current.push(payload.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(payload.candidate);
      } catch (e) {
        console.error("[rtc] addIceCandidate 실패", e);
      }
    }
  }

  async function drainPendingIce(pc: RTCPeerConnection) {
    remoteReadyRef.current = true;
    const pending = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const c of pending) {
      try {
        await pc.addIceCandidate(c);
      } catch (e) {
        console.error("[rtc] addIceCandidate(buffered) 실패", e);
      }
    }
  }

  // 모바일 카메라 전환 (S1.6). 받는쪽이 후면으로 가면 얼굴 유실 → neutral (정상, S3)
  async function switchCamera() {
    const next = facing === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next },
        audio: true,
      });
      const oldStream = localStreamRef.current;
      const newVideo = newStream.getVideoTracks()[0];
      // caller: 비디오 sender 교체
      const sender = pcRef.current
        ?.getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender && newVideo) await sender.replaceTrack(newVideo);
      // 로컬 웹캠 소스 갱신 (callee 트래킹도 이 요소를 계속 읽는다)
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = newStream;
        await webcamVideoRef.current.play().catch(() => {});
      }
      localStreamRef.current = newStream;
      oldStream?.getTracks().forEach((t) => t.stop());
      setFacing(next);
    } catch {
      setError("카메라 전환에 실패했어요.");
    }
  }

  function retry() {
    setError(null);
    startedRef.current = false;
    setStatus("init");
    // 간단히 재진입
    router.refresh();
    location.reload();
  }

  // 언로드·언마운트 정리만 등록. getUserMedia는 자동이 아니라 "통화 시작" 클릭에서 부른다
  // — iOS Safari는 사용자 제스처 없는 getUserMedia를 거부하고, 자동호출은 dev 재마운트 레이스로
  //   "허용 전에 실패"를 일으킨다(2026-09-17 실측). 클릭 게이트가 두 문제를 동시에 해결.
  useEffect(() => {
    const onUnload = () => cleanup();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      cleanup();
    };
  }, [cleanup]);

  // "통화 시작" 클릭 → 권한 요청 + 부팅 (제스처 안에서 getUserMedia, 1회만)
  function startCall() {
    if (startedRef.current) return;
    startedRef.current = true;
    void init();
  }

  // ── 렌더 ──────────────────────────────────────────────
  if (status === "room-full") {
    return (
      <CenterCard>
        <p className="text-lg font-semibold">방이 찼습니다</p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          이 방({room})에는 이미 두 명이 통화 중이에요.
        </p>
        <BackButton />
      </CenterCard>
    );
  }

  if (status === "role-taken") {
    const mine = as === "character" ? "luda(캐릭터)" : "팬(생얼)";
    const other = as === "character" ? "팬(생얼)" : "luda(캐릭터)";
    return (
      <CenterCard>
        <p className="text-lg font-semibold">이미 {mine} 역할이 있어요</p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          이 방({room})엔 {mine}(으)로 참여한 사람이 있어요. {other}(으)로 다시 들어와 주세요.
        </p>
        <BackButton />
      </CenterCard>
    );
  }

  if (status === "error") {
    return (
      <CenterCard>
        <p className="text-lg font-semibold">통화를 시작할 수 없어요</p>
        <p className="mt-1 text-sm text-red-500">{error}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={retry}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            다시 시도
          </button>
          <BackButton />
        </div>
      </CenterCard>
    );
  }

  if (status === "ended") {
    return (
      <CenterCard>
        <p className="text-lg font-semibold">통화가 종료됐어요</p>
        {error && <p className="mt-1 text-sm text-black/60 dark:text-white/60">{error}</p>}
        <BackButton />
      </CenterCard>
    );
  }

  const isCaller = role === "caller";

  // 단일 VRM 캔버스 — caller는 큰 화면, callee는 PIP. (ref 하나, 위치만 역할별로)
  // PIP는 우측 하단(끊기 컨트롤 위). 상단이면 폰 노치/상태바에 얼굴이 가려 잘려 보임.
  const pipBox =
    "absolute right-3 bottom-24 z-10 h-40 w-28 overflow-hidden rounded-xl border border-white/30 bg-black/40 object-cover shadow-lg";
  const bigBox = "absolute inset-0 h-full w-full";
  const canvasClass = isCaller
    ? bigBox + (status === "connected" ? "" : " opacity-0") // 연결 전엔 상대 캐릭터 숨김(조기 노출 방지 — 상대 입장 전 "기다리는 중")
    : role === "callee"
      ? pipBox
      : bigBox + " opacity-0"; // role 배정 전
  // 상대(팬) 실영상: 화면 꽉 채움(object-cover) + 좌우반전(거울, -scale-x-100) — 캐릭터 미러와 일관.
  const remoteVideoClass =
    role === "callee" ? bigBox + " -scale-x-100 object-cover" : "hidden";
  // caller: 웹캠 = PIP(자기 미리보기, 거울처럼 -scale-x-100) / callee: 트래킹 소스라 화면 밖(1px)
  // (CSS 반전은 MediaPipe가 읽는 원본 프레임엔 영향 없음 → 트래킹 무관)
  const webcamClass = isCaller
    ? pipBox + " -scale-x-100"
    : "pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0";

  return (
    <div className="relative h-dvh w-full bg-black text-white">
      {/* 큰 화면 = 상대 (callee 기준). caller는 여기에 remote video 없음(오디오만) */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={remoteVideoClass}
      />

      {/* VRM 캐릭터 캔버스 (caller=큰 화면 luda / callee=PIP 내 캐릭터) */}
      <canvas ref={characterCanvasRef} className={canvasClass} />

      {/* 로컬 웹캠 (caller=PIP 내 생얼 / callee=트래킹 소스, 숨김) */}
      <video
        ref={webcamVideoRef}
        autoPlay
        playsInline
        muted
        className={webcamClass}
      />

      <audio ref={remoteAudioRef} autoPlay />

      {/* 시작 오버레이 — video/canvas는 뒤에 항상 마운트된 채로, 클릭(제스처)에서 권한 요청 */}
      {status === "init" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-6 text-center">
          <div className="w-full max-w-sm">
            <p className="text-lg font-semibold">영상통화 준비</p>
            <p className="mt-1 text-sm text-white/70">
              방 {room} · {as === "character" ? "luda (캐릭터)" : "나 (생얼)"}로 입장
            </p>
            <p className="mt-2 text-xs text-white/50">
              시작을 누르면 카메라·마이크 권한을 요청해요. 허용해 주세요.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={startCall}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black"
              >
                📞 통화 시작
              </button>
              <Link
                href="/chat/luda"
                className="rounded-lg border border-white/30 px-4 py-2.5 text-sm hover:bg-white/10"
              >
                취소
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 상태 배지 */}
      <div className="absolute left-3 top-3 z-20 rounded-full bg-black/50 px-3 py-1 text-xs">
        {status === "waiting" && "상대를 기다리는 중…"}
        {status === "connecting" && "연결 중…"}
        {status === "connected" && (isCaller ? "통화 중 · 팬" : "통화 중 · luda")}
      </div>

      {/* 컨트롤 */}
      <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3">
        {mobile && (
          <button
            type="button"
            onClick={switchCamera}
            className="rounded-full bg-white/15 px-4 py-3 text-sm backdrop-blur hover:bg-white/25"
          >
            🔄 카메라
          </button>
        )}
        <button
          type="button"
          onClick={endCall}
          className="rounded-full bg-red-500 px-6 py-3 text-sm font-semibold hover:bg-red-600"
        >
          끊기
        </button>
      </div>
    </div>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 p-6 text-center dark:border-white/15">
        {children}
      </div>
    </div>
  );
}

function BackButton() {
  return (
    <Link
      href="/chat/luda"
      className="mt-4 inline-block rounded-lg border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    >
      채팅방으로
    </Link>
  );
}
