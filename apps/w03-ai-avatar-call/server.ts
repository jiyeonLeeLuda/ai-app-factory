import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import { handleCallConnection } from "./lib/ws/callConnection";

// custom Node server = 문지기 (w2-spec S4/S6).
// - 일반 HTTP 요청 → Next request handler
// - '/ws' upgrade → ws 핸들러
// - 그 외 upgrade(HMR 등) → Next upgrade handler (Fast Refresh 유지)
// ⚠️ output:"standalone" 병용 금지 (custom server 파일을 trace 안 함).

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "localhost";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

type UpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url ?? "/", true));
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws, req) => {
    void handleCallConnection(ws, req);
  });

  // Next의 upgrade 핸들러는 타입 선언이 없을 수 있어 방어적으로 접근 (HMR 위임용)
  const nextUpgrade = (
    app as unknown as { getUpgradeHandler?: () => UpgradeHandler }
  ).getUpgradeHandler?.();

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/", true);
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (nextUpgrade) {
      nextUpgrade(req, socket, head); // Next HMR 등
    }
    // nextUpgrade가 없으면 소켓을 파괴하지 않고 둔다(HMR 유지 시도).
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}  (ws: /ws)`);
  });
});
