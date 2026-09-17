import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import { handleSignalingConnection } from "./lib/signaling/rooms";

// custom Node HTTPS server = 문지기 (W2.5 S4/S6).
// - HTTPS 요청 → Next request handler
// - '/ws' upgrade → 시그널링 핸들러 (같은 https 서버에 attach → 자동 wss, mixed content 방지)
// - 그 외 upgrade(HMR 등) → Next upgrade handler
// ⚠️ output:"standalone" 병용 금지 (custom server 파일을 trace 안 함, S4).
// 카메라는 secure context(HTTPS/localhost)에서만 → https 필수(S3/함정).

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const CERT_PATH =
  process.env.HTTPS_CERT_PATH ??
  resolve(process.cwd(), "../../factory/certs/172.10.102.176+3.pem");
const KEY_PATH =
  process.env.HTTPS_KEY_PATH ??
  resolve(process.cwd(), "../../factory/certs/172.10.102.176+3-key.pem");

const httpsOptions = {
  cert: readFileSync(CERT_PATH),
  key: readFileSync(KEY_PATH),
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

type UpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

app.prepare().then(() => {
  const server = createServer(
    httpsOptions,
    (req: IncomingMessage, res: ServerResponse) => {
      handle(req, res, parse(req.url ?? "/", true));
    },
  );

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws, req) => {
    handleSignalingConnection(ws, req);
  });

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
  });

  server.listen(port, () => {
    console.log(`> Ready on https://${hostname}:${port}  (wss: /ws)`);
  });
});
