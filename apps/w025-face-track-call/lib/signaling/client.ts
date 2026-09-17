// 브라우저 시그널링 클라이언트 (W2.5 S4). HTTPS 페이지이므로 wss (mixed content 방지, S4).

import type {
  ClientMessage,
  DesiredRole,
  ServerMessage,
  SignalPayload,
} from "./protocol";

export type SignalingClient = {
  send: (payload: SignalPayload) => void;
  close: () => void;
};

export function connectSignaling(
  roomId: string,
  desiredRole: DesiredRole,
  onMessage: (msg: ServerMessage) => void,
): SignalingClient {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url =
    `${proto}://${location.host}/ws?room=${encodeURIComponent(roomId)}` +
    `&as=${desiredRole}`;
  const ws = new WebSocket(url);

  ws.addEventListener("message", (ev) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(ev.data) as ServerMessage;
    } catch {
      return;
    }
    onMessage(msg);
  });

  const send = (payload: SignalPayload) => {
    if (ws.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: "signal", payload };
      ws.send(JSON.stringify(msg));
    }
  };

  return {
    send,
    close: () => {
      try {
        ws.close();
      } catch {
        // 이미 닫힘
      }
    },
  };
}
