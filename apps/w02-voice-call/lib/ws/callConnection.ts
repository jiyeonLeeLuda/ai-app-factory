import type { IncomingMessage } from "node:http";
import { parse } from "node:url";
import { WebSocket, type RawData } from "ws";
import { prisma } from "../prisma";
import {
  transcribe,
  streamSentences,
  synthesize,
  buildCallInstructions,
  type Turn,
} from "../voice/pipeline";

// 연결별 통화 세션 핸들러 (w2-spec S6 lib/ws).
// - 턴 히스토리는 이 연결이 살아있는 동안만 메모리 배열로 유지 → 끊기면 소멸(휘발, S2).
// - 통화 내용은 DB 미저장. 개발 로그로만 전사·응답을 stderr에 남긴다(S4 Q1).

const GREETING = "여보세요?"; // 첫 턴 = 아티스트 선턴 (사용자 입력 없이, S1.3)

// ws 바이너리 프레임(RawData)을 Buffer로 정규화
function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}

export async function handleCallConnection(ws: WebSocket, req: IncomingMessage) {
  const { query } = parse(req.url ?? "", true);
  const artistId = typeof query.artistId === "string" ? query.artistId : null;

  const sendJSON = (obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };
  const sendAudio = (buf: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(buf, { binary: true });
  };

  if (!artistId) {
    sendJSON({ type: "error", message: "아티스트가 지정되지 않았어요." });
    ws.close();
    return;
  }

  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist) {
    sendJSON({ type: "error", message: "아티스트를 찾을 수 없어요." });
    ws.close();
    return;
  }

  const instructions = buildCallInstructions(artist.systemPrompt);
  const history: Turn[] = [];
  let busy = false;
  let closed = false;

  ws.on("close", () => {
    closed = true;
  });
  ws.on("error", () => {
    closed = true;
  });

  // 한 발화 = STT → LLM(문장 스트리밍) → 문장마다 TTS → 순서대로 전송
  async function handleUtterance(audioIn: Buffer) {
    const transcript = (await transcribe(audioIn)).trim();
    console.error(`[call ${artist!.slug}] [STT] ${JSON.stringify(transcript)}`);

    // STT 빈 결과 → 아티스트가 지어내지 않고 다시 듣는 중으로 복귀 (S3)
    if (!transcript) {
      sendJSON({ type: "stt-empty" });
      sendJSON({ type: "state", value: "listening" });
      return;
    }

    history.push({ role: "user", content: transcript });
    sendJSON({ type: "state", value: "speaking" });

    let full = "";
    for await (const sentence of streamSentences(instructions, history)) {
      if (closed) return;
      const audio = await synthesize(sentence);
      if (closed) return;
      sendAudio(audio);
      full += (full ? " " : "") + sentence;
    }
    console.error(`[call ${artist!.slug}] [LLM] ${JSON.stringify(full)}`);

    if (full.trim()) history.push({ role: "assistant", content: full });
    sendJSON({ type: "turn-end" });
    sendJSON({ type: "state", value: "listening" });
  }

  ws.on("message", (data: RawData, isBinary: boolean) => {
    if (!isBinary) return; // 제어 프레임(현재 미사용) — 종료는 ws.close로 처리
    if (busy) return; // 한 번에 한 턴: 진행 중이면 새 발화 무시 (S3 동시 턴)
    busy = true;
    handleUtterance(toBuffer(data))
      .catch((e) => {
        console.error("[call] 턴 처리 실패:", e);
        sendJSON({ type: "error", message: "턴 처리에 실패했어요." });
        sendJSON({ type: "state", value: "listening" });
      })
      .finally(() => {
        busy = false;
      });
  });

  // 첫 턴 선턴 — busy로 감싸 사용자 첫 발화와 겹치지 않게
  busy = true;
  try {
    sendJSON({ type: "state", value: "connected" });
    const audio = await synthesize(GREETING);
    if (!closed) {
      sendAudio(audio);
      history.push({ role: "assistant", content: GREETING });
      console.error(`[call ${artist.slug}] [greeting] ${GREETING}`);
      sendJSON({ type: "turn-end" });
      sendJSON({ type: "state", value: "listening" });
    }
  } catch (e) {
    console.error("[call] 첫 턴 TTS 실패:", e);
    sendJSON({ type: "error", message: "연결 오디오 생성에 실패했어요." });
  } finally {
    busy = false;
  }
}
