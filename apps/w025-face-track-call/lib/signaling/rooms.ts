import type { IncomingMessage } from "node:http";
import { parse } from "node:url";
import { WebSocket, type RawData } from "ws";
import type { ClientMessage, ServerMessage } from "./protocol";

// ws 시그널링 서버 (W2.5 S4/S6). custom https server가 '/ws' 업그레이드를 여기로 넘긴다.
// - 룸 상태(roomId → sockets)는 이 프로세스 메모리로만 유지 → 끊기면 소멸(휘발, S2).
// - 첫 입장 = caller(생얼), 둘째 = callee(캐릭터), 셋째 = room-full 거부(2인 고정, S3).

type Peer = { ws: WebSocket; role: "caller" | "callee" };
const rooms = new Map<string, Peer[]>();

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function handleSignalingConnection(ws: WebSocket, req: IncomingMessage) {
  const { query } = parse(req.url ?? "", true);
  const roomId = typeof query.room === "string" ? query.room : null;

  if (!roomId) {
    send(ws, { type: "room-full" }); // 방번호 없음 — 진입 거부
    ws.close();
    return;
  }

  const peers = rooms.get(roomId) ?? [];

  // 3번째 입장 거부 (S3)
  if (peers.length >= 2) {
    send(ws, { type: "room-full" });
    ws.close();
    return;
  }

  // 역할은 입장 시 사용자가 고른 값으로 배정 (v1.4 — 순서가 아니라 선택).
  // as=fan → caller(생얼), as=character → callee(캐릭터). 미지정이면 남은 역할로 폴백.
  const asParam = typeof query.as === "string" ? query.as : null;
  const desired: "caller" | "callee" | null =
    asParam === "character" ? "callee" : asParam === "fan" ? "caller" : null;

  let role: "caller" | "callee";
  if (desired) {
    // 고른 역할이 이미 참여 중이면 거부 (같은 역할 2명 방지 → 결정적 배정)
    if (peers.some((p) => p.role === desired)) {
      send(ws, { type: "role-taken", role: desired });
      ws.close();
      return;
    }
    role = desired;
  } else {
    // 폴백: 남은 역할 배정 (직접 URL 등 as 미지정)
    role = peers.some((p) => p.role === "caller") ? "callee" : "caller";
  }

  const self: Peer = { ws, role };
  peers.push(self);
  rooms.set(roomId, peers);

  send(ws, { type: "role", role });
  console.error(`[signaling] room=${roomId} join role=${role} (${peers.length}/2)`);

  // 둘째가 들어오면 caller에게 peer-ready → caller가 offer 생성 (자동 연결 시작, S1.2)
  if (peers.length === 2) {
    const caller = peers.find((p) => p.role === "caller");
    if (caller) send(caller.ws, { type: "peer-ready" });
  }

  const other = () => (rooms.get(roomId) ?? []).find((p) => p.ws !== ws);

  ws.on("message", (data: RawData) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (msg.type === "signal") {
      const peer = other();
      if (peer) send(peer.ws, { type: "signal", payload: msg.payload });
    }
  });

  const cleanup = () => {
    const list = rooms.get(roomId);
    if (!list) return;
    const next = list.filter((p) => p.ws !== ws);
    if (next.length === 0) rooms.delete(roomId);
    else {
      rooms.set(roomId, next);
      send(next[0].ws, { type: "peer-left" }); // 상대에게 이탈 통지 (S3)
    }
    console.error(`[signaling] room=${roomId} leave role=${role}`);
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}
